import type { InvestmentNote, NoteCheck } from "../../../../packages/domain/src/agent.ts";
import type {
  ThesisSignal,
  ThesisSignalResult,
  ThesisSnapshot,
  ThesisVerdict,
} from "../../../../packages/domain/src/investor.ts";
import type { MarketDataService } from "../../../../packages/integrations/src/market-data.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import type { SearchService } from "../search.ts";

/** 距离破坏线多近算"受威胁"：贴着边界时不下结论，交给人看。 */
export const AT_RISK_BAND = 0.05;
/** 财务字段的容差带（相对阈值）。 */
const FINANCIAL_BAND = 0.1;

const NOTE_KIND = "notes";
const MAX_EVIDENCE = 6;

function signalLabel(signal: ThesisSignal): string {
  if (signal.label) return signal.label;
  switch (signal.kind) {
    case "price":
      return `价格${signal.direction === "above" ? "高于" : "低于"} ${signal.value}`;
    case "change_pct":
      return `涨跌幅${signal.direction === "up" ? "达 +" : "达 -"}${signal.value}%`;
    case "keyword":
      return `新闻${signal.expect === "present" ? "出现" : "不出现"}「${signal.keywords[0]}」`;
    case "financial":
      return `${signal.field} ${signal.operator} ${signal.value}`;
  }
}

function breachResult(signal: ThesisSignal, detail: string): ThesisSignalResult {
  const severity = signal.onBreach ?? "invalid";
  return {
    signal,
    state: severity === "threat" ? "at_risk" : "broken",
    detail: severity === "threat" ? `${detail}（跟踪信号走弱，需复核论点）` : detail,
  };
}

/** 判定单条信号；取不到数据一律 unknown，绝不猜结论。 */
export function judgeSignal(signal: ThesisSignal, snapshot: ThesisSnapshot): ThesisSignalResult {
  switch (signal.kind) {
    case "price": {
      const price = snapshot.price;
      if (typeof price !== "number" || !Number.isFinite(price))
        return { signal, state: "unknown", detail: "缺少最新价格，无法判定。" };
      const boundary = signal.value;
      if (!(boundary > 0)) return { signal, state: "unknown", detail: "阈值无效。" };
      const cushion =
        signal.direction === "above"
          ? (price - boundary) / boundary
          : (boundary - price) / boundary;
      const detail = `${signalLabel(signal)}；当前 ${price}，缓冲 ${(cushion * 100).toFixed(1)}%。`;
      if (cushion >= AT_RISK_BAND) return { signal, state: "holds", detail };
      if (cushion >= 0) return { signal, state: "at_risk", detail };
      return breachResult(signal, `已跌破/涨破跟踪线：${detail}`);
    }
    case "change_pct": {
      const change = snapshot.changePercent;
      if (typeof change !== "number" || !Number.isFinite(change))
        return { signal, state: "unknown", detail: "缺少涨跌幅数据，无法判定。" };
      const expected = signal.direction === "up" ? change : -change;
      const detail = `${signalLabel(signal)}；当前 ${change.toFixed(2)}%。`;
      if (expected >= signal.value) return { signal, state: "holds", detail };
      if (expected >= signal.value * 0.8) return { signal, state: "at_risk", detail };
      return breachResult(signal, `方向性信号未达成：${detail}`);
    }
    case "keyword": {
      const headlines = snapshot.headlines;
      if (!headlines?.length)
        return { signal, state: "unknown", detail: "没有可用的新闻标题，无法判定。" };
      const hit = headlines.find((headline) =>
        signal.keywords.some((keyword) => headline.includes(keyword)),
      );
      const present = Boolean(hit);
      const detail = present
        ? `新闻命中「${signal.keywords.find((keyword) => hit?.includes(keyword)) ?? signal.keywords[0]}」：${hit?.slice(0, 80)}`
        : `最近 ${headlines.length} 条新闻未命中关键词。`;
      const satisfied = signal.expect === "present" ? present : !present;
      if (satisfied) return { signal, state: "holds", detail };
      return breachResult(signal, detail);
    }
    case "financial": {
      const value = snapshot.financials?.[signal.field];
      if (typeof value !== "number" || !Number.isFinite(value))
        return {
          signal,
          state: "unknown",
          detail: `缺少 ${signal.field} 的观测值，无法判定。`,
        };
      const holds =
        signal.operator === ">="
          ? value >= signal.value
          : signal.operator === "<="
            ? value <= signal.value
            : Math.abs(value - signal.value) < 1e-9;
      const detail = `${signalLabel(signal)}；当前 ${signal.field}=${value}。`;
      if (holds) return { signal, state: "holds", detail };
      const near =
        signal.operator === "=="
          ? false
          : Math.abs(value - signal.value) <= Math.abs(signal.value) * FINANCIAL_BAND;
      if (near) return { signal, state: "at_risk", detail };
      return breachResult(signal, detail);
    }
  }
}

/**
 * 聚合判定：任何一个"不成立级"信号破了 → 不成立；只有"受威胁级"破了 → 待验证；
 * 全部成立 → 成立；一条数据都取不到 → 待人工确认（不伪造结论）。
 */
export function judgeThesis(
  signals: readonly ThesisSignal[],
  snapshot: ThesisSnapshot,
): ThesisVerdict {
  if (!signals.length) {
    return {
      outcome: "pending_confirmation",
      results: [],
      missing: [],
      summary: "论点尚未绑定可观测信号，无法自动判定；请先绑定价格/涨跌幅/关键词/财务字段。",
    };
  }
  const results = signals.map((signal) => judgeSignal(signal, snapshot));
  const missing = results
    .filter((result) => result.state === "unknown")
    .map((result) => `${signalLabel(result.signal)}：${result.detail}`);
  const broken = results.filter((result) => result.state === "broken");
  const atRisk = results.filter((result) => result.state === "at_risk");
  const holds = results.filter((result) => result.state === "holds");

  let outcome: ThesisVerdict["outcome"];
  let summary: string;
  if (broken.length) {
    outcome = "invalid";
    summary = `${broken.length} 条信号已破坏：${broken.map((r) => r.detail).join("；")}`;
  } else if (atRisk.length) {
    outcome = "inconclusive";
    summary = `${atRisk.length} 条信号走弱，论点受威胁，需人工复核：${atRisk
      .map((r) => r.detail)
      .join("；")}`;
  } else if (holds.length === results.length) {
    outcome = "valid";
    summary = `${holds.length} 条信号全部成立。`;
  } else {
    outcome = "pending_confirmation";
    summary = `数据不足，${missing.length} 条信号未能判定。`;
  }
  return { outcome, results, missing, summary };
}

/** 把判定压成一句可存进 note.check.note 的话（≤ 500 字）。 */
export function verdictNote(verdict: ThesisVerdict): string {
  return verdict.summary.slice(0, 500);
}

export interface ThesisEvidenceDeps {
  db: Store;
  market: Pick<MarketDataService, "getQuote">;
  search?: Pick<SearchService, "search">;
}

/**
 * 论点证据服务。
 *
 * 关键约束（PRD §9.1「判定必须绑定证据、状态可人工覆盖」）：
 *   - 只有用户绑定了证据才自动判定，绝不凭研报文字猜结论。
 *   - 行情 / 新闻取不到时判 pending，并在 note 里写清缺什么。
 *   - 自动判定只写 check（source=automated），用户手动确认的记录不覆盖。
 */
export class ThesisEvidenceService {
  constructor(private readonly deps: ThesisEvidenceDeps) {}

  async attach(owner: string, noteId: string, evidence: ThesisSignal[]): Promise<InvestmentNote> {
    const note = await this.deps.db.get<InvestmentNote>(owner, NOTE_KIND, noteId);
    if (!note) throw new AppError("Note not found", 404);
    if (note.type !== "THESIS") throw new AppError("Only THESIS notes can bind evidence", 422);
    if (evidence.length > MAX_EVIDENCE) throw new AppError(`At most ${MAX_EVIDENCE} signals`, 422);
    return this.deps.db.put(owner, NOTE_KIND, {
      ...note,
      evidence,
      updated_at: new Date().toISOString(),
    });
  }

  async snapshot(owner: string, note: InvestmentNote): Promise<ThesisSnapshot> {
    const signals = note.evidence ?? [];
    const snapshot: ThesisSnapshot = {};
    const needsQuote = signals.some(
      (signal) => signal.kind === "price" || signal.kind === "change_pct",
    );
    if (needsQuote) {
      try {
        const quote = await this.deps.market.getQuote(note.symbol_code);
        snapshot.price = quote.price;
        snapshot.changePercent = quote.changePercent;
      } catch {
        // 行情不可用：留空，对应信号会被判为 unknown。
      }
    }
    const keywordSignal = signals.find((signal) => signal.kind === "keyword");
    if (keywordSignal && keywordSignal.kind === "keyword" && this.deps.search) {
      try {
        const result = await this.deps.search.search(owner, `thesis:${note.id}`, {
          objective: `Check news headlines relevant to ${note.symbol_code} for a tracked investment thesis.`,
          search_queries: [`${note.symbol_code} ${keywordSignal.keywords.join(" ")}`],
        });
        snapshot.headlines = result.results
          .map((item) => item.title ?? "")
          .filter((title): title is string => Boolean(title))
          .slice(0, 10);
      } catch {
        // 搜索不可用：保留 headlines 为空，关键词信号判 unknown。
      }
    }
    return snapshot;
  }

  async evaluate(owner: string, note: InvestmentNote): Promise<ThesisVerdict | null> {
    if (note.type !== "THESIS" || !note.evidence?.length) return null;
    const snapshot = await this.snapshot(owner, note);
    return judgeThesis(note.evidence, snapshot);
  }

  /**
   * 只产出判定结果、不落库：供周检批量复用，写回由调用方统一负责。
   * 返回 null 表示没有绑定证据（由调用方决定是否标待确认）。
   */
  async evaluateCheck(
    owner: string,
    note: InvestmentNote,
    now = new Date(),
  ): Promise<NoteCheck | null> {
    if (note.check?.source === "manual") return null;
    const verdict = await this.evaluate(owner, note);
    if (!verdict) return null;
    return {
      outcome: verdict.outcome,
      source: "automated",
      checked_at: now.toISOString(),
      note: verdictNote(verdict),
      reasons: verdict.results
        .filter((result) => result.state !== "holds")
        .slice(0, 6)
        .map((result) => result.detail.slice(0, 300)),
    };
  }

  /**
   * 自动回检一条论点并写回。用户手动确认过的论点不会被自动判定覆盖。
   */
  async check(owner: string, note: InvestmentNote, now = new Date()): Promise<NoteCheck | null> {
    const check = await this.evaluateCheck(owner, note, now);
    if (!check) return null;
    await this.deps.db.put(owner, NOTE_KIND, {
      ...note,
      check,
      // 只有明确"不成立"才落 INVALIDATED；受威胁 / 缺数据保持 ACTIVE，等人确认。
      ...(check.outcome === "invalid" ? { status: "INVALIDATED" as const } : {}),
      last_checked_at: check.checked_at,
      updated_at: check.checked_at,
    });
    return check;
  }
}
