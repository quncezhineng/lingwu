import { execFile } from "node:child_process";
import { backgroundFailure } from "./log.ts";

export type AkshareStatus = "available" | "unavailable" | "disabled" | "checking";
export type AkshareReason = "python_missing" | "akshare_missing" | "timeout" | "error";

export interface AkshareHealth {
  status: AkshareStatus;
  version?: string;
  reason?: AkshareReason;
  detail?: string;
  checked_at?: string;
}

export interface MarketDataHealthSnapshot {
  akshare: AkshareHealth;
}

/** Runs `python3 -c <script>` and resolves stdout. Injectable for tests. */
export type HealthRunner = (script: string, timeoutMs: number) => Promise<string>;

const PROBE_SCRIPT = "import akshare\nprint(akshare.__version__)";
const DEFAULT_TTL_MS = 300_000;
const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_DETAIL_LENGTH = 160;

function sanitize(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL_LENGTH);
}

const defaultRunner: HealthRunner = (script, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(
      process.env.AKSHARE_PYTHON ?? "python3",
      ["-c", script],
      { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 256 * 1024, env: process.env },
      (error, stdout, stderr) => {
        if (error) {
          const failure = error as NodeJS.ErrnoException & { killed?: boolean; stderr?: string };
          const wrapped = new Error(stderr || error.message) as Error & {
            code?: string;
            killed?: boolean;
          };
          wrapped.code = failure.code;
          wrapped.killed = failure.killed;
          reject(wrapped);
          return;
        }
        resolve(stdout);
      },
    );
  });

/** Map a helper failure to a stable reason so operators can alert on one field. */
export function classifyProbeFailure(error: unknown): { reason: AkshareReason; detail?: string } {
  const failure = (error ?? {}) as { code?: unknown; killed?: unknown; message?: unknown };
  const message = typeof failure.message === "string" ? failure.message : "";
  if (failure.code === "ENOENT")
    return { reason: "python_missing", detail: "python3 was not found on PATH" };
  if (/No module named ['"]?akshare/i.test(message))
    return { reason: "akshare_missing", detail: sanitize(message) };
  if (failure.killed === true || failure.code === "ETIMEDOUT")
    return { reason: "timeout", detail: "AKShare probe timed out" };
  return { reason: "error", detail: sanitize(message || "AKShare probe failed") };
}

export interface MarketDataHealth {
  /** Cached snapshot; never blocks, kicks a background probe when stale. */
  snapshot(): MarketDataHealthSnapshot;
  /** Run (or reuse) a probe. `force` bypasses the TTL cache. */
  refresh(force?: boolean): Promise<AkshareHealth>;
}

export interface MarketDataHealthOptions {
  runner?: HealthRunner;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
  log?: (entry: Record<string, unknown>) => void;
}

export function createMarketDataHealth(options: MarketDataHealthOptions = {}): MarketDataHealth {
  const env = options.env ?? process.env;
  const runner = options.runner ?? defaultRunner;
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? (Number(env.MARKET_DATA_HEALTH_TTL_MS) || DEFAULT_TTL_MS);
  const timeoutMs =
    options.timeoutMs ?? (Number(env.MARKET_DATA_AKSHARE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));

  let cached: AkshareHealth = { status: "checking" };
  let checked = false;
  let checkedAt = 0;
  let inFlight: Promise<AkshareHealth> | null = null;

  const timestamp = () => new Date(now()).toISOString();

  async function probe(): Promise<AkshareHealth> {
    if (env.MARKET_DATA_AKSHARE_ENABLED === "false")
      return {
        status: "disabled",
        reason: undefined,
        detail: "MARKET_DATA_AKSHARE_ENABLED=false",
        checked_at: timestamp(),
      };
    try {
      const stdout = await runner(PROBE_SCRIPT, timeoutMs);
      const version = stdout.trim().split("\n").pop()?.trim();
      const result: AkshareHealth = {
        status: "available",
        ...(version ? { version } : {}),
        checked_at: timestamp(),
      };
      log({
        timestamp: timestamp(),
        context: { phase: "akshare-self-check" },
        market_data: { akshare: { status: result.status, version: version ?? null } },
      });
      return result;
    } catch (error) {
      const classified = classifyProbeFailure(error);
      const result: AkshareHealth = {
        status: "unavailable",
        ...classified,
        checked_at: timestamp(),
      };
      // A-share data silently degrades to Yahoo when this fails, so make it visible.
      log({
        timestamp: timestamp(),
        context: { phase: "akshare-self-check" },
        market_data: { akshare: { status: result.status, reason: classified.reason } },
      });
      return result;
    }
  }

  function refresh(force = false): Promise<AkshareHealth> {
    if (inFlight) return inFlight;
    if (!force && checked && now() - checkedAt < ttlMs) return Promise.resolve(cached);
    inFlight = probe()
      .then((result) => {
        cached = result;
        checked = true;
        checkedAt = now();
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return {
    snapshot() {
      if (!checked || now() - checkedAt >= ttlMs)
        void refresh().catch((error) => backgroundFailure("akshare health probe", error));
      return { akshare: { ...cached } };
    },
    refresh,
  };
}

let singleton: MarketDataHealth | undefined;

/** Process-wide probe shared by the health route and the startup self-check. */
export function getMarketDataHealth(): MarketDataHealth {
  singleton ??= createMarketDataHealth();
  return singleton;
}
