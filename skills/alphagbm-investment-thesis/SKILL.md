---
name: alphagbm-investment-thesis
description: >
  Create investment theses linked to a company profile. Each thesis tracks
  the "why" behind a position: buy logic, conviction drivers, and exit
  triggers. Every update logs the thesis state change with AI-generated
  reasoning — "the thesis didn't change, but the evidence got weaker."
  Use when: writing a buy thesis, setting a price target, defining what
  would make you sell, tracking thesis drift. Triggers on: "write a thesis
  on NVDA", "what was my buy case for AAPL", "update my TSLA thesis",
  "what would make me sell MSFT", "投资逻辑", "论据", "止损理由",
  "论据被打破".
name_zh: AlphaGBM 投资论文
description_zh: >
  创建与公司档案关联的投资论据。每个论据跟踪持仓背后的"为什么"：买入逻辑、信念驱动因素和退出触发条件。每次更新都会记录论据状态变化并附带 AI 生成的推理——"论据没有变，但证据变弱了"。使用场景：撰写买入论据、设定目标价、定义什么情况会让你卖出、跟踪论据偏离。
  触发词："写一份 NVDA 的论据"、"我当初买 AAPL 的理由是什么"、"更新我的 TSLA 论据"、"什么会让我卖出 MSFT"、"投资逻辑"、"论据"、"止损理由"、"论据被打破"
---

# AlphaGBM Investment Thesis

Write, track, and close investment theses — buy/sell conviction documented in one place, linked to a company profile.

## When to use

- User has bought (or is considering) a stock and wants to document the reasoning
- User asks for "exit plan" / "sell discipline" / "what would make me sell"
- During a sell decision, user wants to check if the original thesis has broken
- User mentions "投资逻辑" / "论据" / "止损理由"
- User wants to update a thesis without rewriting the whole thing

## Prerequisites

- **API Key**: env `ALPHAGBM_API_KEY` (format `agbm_xxxx…`).
- **Base URL**: default `https://alphagbm.zeabur.app`. Override via `ALPHAGBM_BASE_URL`.
- A company profile must exist for the ticker before creating a thesis — the thesis is always linked to a profile. If the user hasn't created one yet, call `alphagbm-company-profile` first.

## API Endpoints

All endpoints require `Authorization: Bearer $ALPHAGBM_API_KEY`.

### 1. Create thesis

```
POST /api/research/profiles/<TICKER>/thesis
Content-Type: application/json

{
  "buy_reason": "Revenue growth 25%+ YoY, GPU demand expected to double",
  "conviction_drivers": "AI capex cycle, competitive moat, strong cash flow",
  "exit_trigger": "Seek exit if: EPS growth drops below 15%, or NVDA loses >20% from ATH"
}
```

| Parameter            | Type   | Required | Description                                   |
| -------------------- | ------ | -------- | --------------------------------------------- |
| `buy_reason`         | string | yes      | The "why" behind this trade — 1-2 sentences   |
| `conviction_drivers` | string | yes      | What would make conviction stronger or weaker |
| `exit_trigger`       | string | yes      | Conditions that would trigger a sell          |

**409 with `existing_thesis`** if a thesis already exists for this ticker. Use `PUT` to update instead.

### 2. Update thesis

```
PUT /api/research/profiles/<TICKER>/thesis
Content-Type: application/json

{"buy_reason": "...", "conviction_drivers": "...", "exit_trigger": "..."}
```

Same body as create. Returns the updated thesis + a new `state_change_log` entry. State tracks: `{original_state, new_state, reasoning}`.

### 3. Get thesis

```
GET /api/research/profiles/<TICKER>/thesis
```

Returns the full thesis. Also accessible as a nested field in `GET /api/research/profiles/<TICKER>` (the `thesis` field).

### 4. Close thesis

```
POST /api/research/profiles/<TICKER>/thesis/close
Content-Type: application/json

{"reason": "EPS growth dropped to 12%, below 15% exit threshold"}
```

Marks `status: "closed"` and unpins the thesis from the profile. The record is retained for audit history but won't appear in active views.

## Response schema — thesis

```json
{
  "id": 42,
  "ticker": "NVDA",
  "status": "active",
  "buy_reason": "...",
  "conviction_drivers": "...",
  "exit_trigger": "...",
  "state_change_log": [
    {
      "changed_at": "2026-04-10",
      "original_state": "active",
      "new_state": "active",
      "reasoning": "Q1 results: growth in line, no thesis change. CFO commentary on H200 ramp supports conviction."
    }
  ],
  "created_at": "2026-03-15T08:00:00Z",
  "updated_at": "2026-04-13T09:45:00Z"
}
```

### State Change Log

Every `PUT` update is semantically diffed by AI: "did the thesis change?" vs "did the evidence change?". The state log captures:

- `original_state` → `new_state` (both usually `"active"` unless the thesis was closed)
- `reasoning` — AI-generated summary of what changed and whether it's concerning

### Invalidation Event

When the AI detects that the core assumption has broken (e.g., growth is now 12% but thesis requires >15%), it returns:

- `state_change_log` entry with `{new_state: "warning"}` and reasoning: "⚠️ Evidence weakening"
- `health_check` detects `thesis_drift` for flagged theses (used by `alphagbm-health-check`)

This is display material — it does NOT auto-close the thesis. The user decides when to close.

## Typical Workflow

```
1. User bought NVDA a month ago. "Write my buy case."
   → (Ensure profile exists, then) POST /api/research/profiles/NVDA/thesis
   → Confirm: "Thesis saved — NVDA: AI capex bet, exit if EPS growth < 15%."

2. User returns after Q1: "Is my NVDA thesis still valid?"
   → GET /api/research/profiles/NVDA/thesis
   → AI provides fresh analysis: "Revenue still 22% YoY — conviction intact"

3. User: "Update my exit trigger to 20% drawdown from ATH"
   → PUT /api/research/profiles/NVDA/thesis
   → New state log entry: exit trigger tightened

4. Stock sells off 22% from ATH. User: "Close my NVDA thesis"
   → POST /api/research/profiles/NVDA/thesis/close {"reason": "hit >20% drawdown exit"}
```

## Presentation Tips

When showing a thesis:

1. **Structure as: Buy Logic → Conviction Drivers → Exit Trigger** — this is the canonical 3-part format
2. **State change log as timeline** — show the most recent 3-5 entries chronologically
3. **Warning callout** — if the latest log entry includes a warning signal, emphasize it
4. **"Exit met?"** — if the stock is currently near the exit trigger, flag it with a timer/checklist
5. **"Update?"** — after every API refresh of the linked profile, offer to run a thesis check

## Related Skills

- **alphagbm-company-profile** — Profiles that theses link to; create one first
- **alphagbm-health-check** — Detects thesis drift across the workspace

---

_Powered by [AlphaGBM](https://alphagbm.com) — Real-data options & research intelligence for traders and AI agents. 10K+ users._
