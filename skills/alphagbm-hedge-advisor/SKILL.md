---
name: alphagbm-hedge-advisor
description: |
  Full hedging intelligence for a single ticker or a position set. Returns a
  "Hedge Sweep" (atm_put, tail_hedge, laddered_hedge, ewp, vxx), a "Hedge
  Monitor" smart-proxy table that explains exactly which instrument hedges
  which risk, a "Market State" risk-matrix (tag + VIX + cost-of-hedge), and a
  "Do-Nothing" sanity check to prevent over-hedging. All four panels in one
  call, no subscription.
  Triggers: "hedge NVDA", "how to hedge my SPY position", "cheapest way to
  protect downside", "tail hedge AAPL", "protective put cost MSFT", "market
  crash insurance", "are puts expensive now", "portfolio hedging strategy",
  "how much should I spend on protection", "insurance for position"
name_zh: AlphaGBM 对冲顾问
description_zh: |
  为单一标的或一组持仓提供完整对冲情报。一次调用返回四个面板："对冲扫描"（平价看跌、尾部对冲、阶梯对冲、等权重看跌、VXX）、"对冲监控"智能代理表（精确解释哪种工具对冲哪种风险）、"市场状态"风险矩阵（标签 + VIX + 对冲成本），以及"什么都不做"合理性检查（防止过度对冲）。
  触发词："对冲 NVDA"、"如何对冲我的 SPY 持仓"、"最便宜的下行保护方式"、"尾部对冲 AAPL"、"保护性看跌成本 MSFT"、"市场崩盘保险"、"现在看跌期权贵吗"、"组合对冲策略"、"我应该花多少买保护"、"持仓保险"
globs:
  - 'mock-data/hedge-advisor/**'
---

# AlphaGBM Hedge Advisor

A four-panel hedge factory, modeled on the logic real market-makers apply when
quoting corporate hedging programs — but stripped down to one public endpoint,
no auth, no subscription.

## What This Skill Does

### 1. Hedge Sweep — Priced Alternatives

| Hedge Type                      | Description                                        | Best When…                     |
| ------------------------------- | -------------------------------------------------- | ------------------------------ |
| **ATM Put**                     | Near-delta, standard protection                    | You want simple downside floor |
| **Tail Hedge**                  | 15-20% OTM 3-month put, positioned for VIX spike   | Scared of crash, not grind     |
| **Laddered Hedge**              | 2-3 staggered put strikes for cheaper blended cost | Don't want all-or-nothing      |
| **EWP (Equity-Weighted Proxy)** | If ticker has no options, proxy via correlated ETF | Sector-relevant alternative    |
| **Collar**                      | ATM put funded by OTM call                         | Zero-cost protection           |
| **VXX/UVXY**                    | Long vol delta, not direction-specific             | Pure vol spike, systemic event |

### 2. Hedge Monitor — Smart Proxy Matching

For any derivative mentioned: "What risk does this instrument actually hedge?"
Returns a cross-reference table mapping instrument → risk-type → correlation
rationale (zh + en). Uses BULL / BEAR tags and clearly identifies when a proxy
is indirect (e.g., VXX doesn't hedge NVDA-specific risk, only vol).

### 3. Market State — Risk Matrix

- `tag` — one of: `calm / cautious / elevated / distressed`
- `tag map` — the 2x2 matrix: VIX × hedging cost
- `explanation` — zh + en plain-language summary of what this state means
- `credit call` — should you be selling vol (credit) or buying it (debit) in
  this environment?

### 4. Do-Nothing — The Sanity Check

Because most people over-hedge and bleed. Returns:

- `premium_cost_pct` — what you'd pay as % of notional
- `breakeven_drop_pct` — how much the underlying must fall before the hedge pays
- `unhedged_upside_pct` — what you sacrifice if you collar
- `verdict` — three tiers: `HEDGE (green light) / HOLD (enough) / NAKED (you're fine)`
- `rationale` (zh + en) — "Hedging right now costs 3.1%/yr and only pays after a 5.8% drop"

## How to Use

**Input:**

- `ticker` (required)
- `size_shares` (optional, defaults to 100)
- `scenario` (optional) — `crash / volatility / systemic / all`

**Output:** All four panels in one JSON response.

## Example Queries

- `hedge NVDA` — All four panels for NVDA
- `how to hedge my SPY position` — 100 shares of SPY, all scenarios
- `cheapest protection for AAPL` — The Hedge Sweep panel emphasizes cost
- `should I just buy VIX calls instead` — Proxy Match explains what VIX really hedges
- `is my AAPL position fine as-is` — Do-Nothing panel gives the verdict

## Mock Data

Mock data in `mock-data/hedge-advisor/` — example for AAPL during calm VIX.

## API Endpoint

```
GET /api/hedge/sweep?ticker={SYMBOL}&size_shares={N}&scenario={SCENARIO}
```

No auth required.

Response shape:

```json
{
  "success": true,
  "ticker": "AAPL",
  "position_size_shares": 100,
  "spot": 185.4,
  "sweep": [
    { "hedge_type": "atm_put", "strike": 185, "days": 30, "ask": 3.1, "cost_pct": 1.67, "dte": 31 },
    {
      "hedge_type": "tail_hedge",
      "strike": 148,
      "days": 90,
      "ask": 1.25,
      "cost_pct": 0.67,
      "dte": 90
    },
    {
      "hedge_type": "collar",
      "put_strike": 180,
      "call_strike": 195,
      "net_cost": 0.8,
      "cost_pct": 0.43,
      "dte": 45
    },
    {
      "hedge_type": "ewp",
      "proxy_type": "bet",
      "symbol": "XLK",
      "reason": "AAPL 是 XLK 最大权重股,相关性 0.92",
      "spread": "sell +5% OTM put"
    }
  ],
  "monitor": {
    "entries": [
      {
        "instrument": "ATM Put",
        "risk_type": "downside tail",
        "tag": "BEAR",
        "correlation_rationale": "直接锁定卖出价格,1:1 floor 保护"
      },
      {
        "instrument": "Collar",
        "risk_type": "range-bound downside",
        "tag": "BEAR",
        "correlation_rationale": "牺牲上行空间换取免费下行保护"
      },
      {
        "instrument": "VXX",
        "risk_type": "vol spike",
        "tag": "BULL",
        "correlation_rationale": "不保证个股对冲 — 只对冲指数级 VIX 飙升"
      }
    ],
    "summary_zh": "VXX 是纯波动率对冲,不保证个股保护",
    "summary_en": "VXX is pure vol — does not guarantee stock-level protection"
  },
  "market_state": {
    "vix": 18.2,
    "tag": "calm",
    "tag_map_zh": {
      "calm": "波动率低 · 对冲成本一般",
      "cautious": "波动率中性 · 建议卖波动",
      "elevated": "波动率偏高 · 对冲较贵",
      "distressed": "极端波动 · 对冲极为昂贵"
    },
    "explanation_zh": "当前 VIX 18.2 处于低位,对冲成本可控。横盘或小幅上扬概率较高,但买 Put 保费已降下来。",
    "credit_call": true
  },
  "do_nothing": {
    "premium_cost_pct": 1.67,
    "breakeven_drop_pct": 5.8,
    "unhedged_upside_pct": 3.0,
    "verdict": "HOLD",
    "rationale_zh": "当前对冲年化成本约 20% — 除非你预期 5.8% 以上下跌,否则持有标的更划算。",
    "rationale_en": "Hedging costs ~20% annualized. Unless you expect a >5.8% drop, holding unhedged is cheaper."
  },
  "timestamp": "2026-04-24T08:00:00"
}
```

Pricing: **free — no auth, no credit deduction**. 5-min cache per (ticker, size) pair.

## Related Skills

| Skill                                                      | Relevance                                               |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| [alphagbm-vix-status](../alphagbm-vix-status/)             | VIX tier + futures contango feed the Market State panel |
| [alphagbm-options-strategy](../alphagbm-options-strategy/) | Build custom multi-leg hedges beyond the standard five  |
| [alphagbm-pnl-simulator](../alphagbm-pnl-simulator/)       | Simulate hedge P&L at different underlying prices       |

---

_Powered by [AlphaGBM](https://alphagbm.com) — Real-data options & research intelligence. 10K+ users._
