---
name_en: variance-commentary
description_en: Write flux commentary for every P&L and balance-sheet line over threshold — current vs prior period and vs budget, with the driver explained from underlying activity. Use for the month-end close package and management reporting.
name_zh: 差异分析评论
description_zh: 为基金业绩差异撰写分析评论——解释实际与预期之间的差异。按资产类别、地域和策略分解差异来源。
---

# Variance commentary

Given current-period actuals, prior-period actuals, and budget for the same scope, produce a commentary table.

## Threshold

Flag a line for commentary if **either** is true:

- Absolute variance ≥ the firm's materiality threshold (use the provided value; default 5% of the line or a fixed floor, whichever is greater)
- The line is on the "always comment" list (revenue, headcount cost, cash)

## For each flagged line

| Column                             | Content                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Line**                           | Account or caption                                                                              |
| **Current / Prior / Budget**       | The three values                                                                                |
| **Δ vs prior** and **Δ vs budget** | Amount and %                                                                                    |
| **Driver**                         | One sentence explaining the movement from underlying activity — not a restatement of the number |

A driver explains _why_, not _what_: "Cloud spend up $1.2M on incremental GPU reservations for the May launch" — not "Cloud spend increased $1.2M (18%)."

## Sourcing the driver

Look at the activity behind the line (journal-source breakdown, vendor mix, headcount delta, volume × rate) via the internal-gl MCP. If the driver isn't clear from the data, write "driver unclear — flag for controller" rather than inventing one.

## Output

The commentary table plus a short narrative (3–5 sentences) summarizing the period's biggest movers.
