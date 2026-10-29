---
name_en: china-dcf-model
description_en: Discounted cash flow (DCF) valuation model for A-share equities. This alias skill redirects to china-dcf, which provides comprehensive DCF modeling adapted for Chinese market conventions. Triggers on "A股DCF模型", "DCF估值", "DCF model China", "现金流折现", "discounted cash flow A-share", or "DCF [company]".
name_zh: 中国DCF模型
description_zh: 为中国A股构建机构级DCF估值模型。适配中国市场数据源（万得Wind、AkShare等），包含中国国债基准的无风险利率、中国市场风险溢价和中国特色增长假设。
---

# china-dcf-model

> **Note:** This skill is an alias/wrapper for `china-dcf`. For full DCF modeling guidance, see `china-dcf/SKILL.md`.

## Purpose

Provide access to **A股DCF估值** — discounted cash flow valuation adapted for Chinese market parameters.

## Quick Reference

### Core DCF Parameters (China)

| Parameter           | Typical Value      | Source                      |
| ------------------- | ------------------ | --------------------------- |
| Risk-free rate      | 2.0-3.0%           | China 10Y CGB yield         |
| Equity risk premium | 6-8%               | China-specific              |
| Beta                | 0.8-1.2            | A-share historical          |
| Cost of debt        | 3-6%               | China corporate bond yields |
| Terminal growth     | 3-4%               | China GDP long-term         |
| Tax rate            | 25% (15% for 高新) | CAS                         |

### Key Differences from US DCF

| Aspect          | US            | China (A-share)      |
| --------------- | ------------- | -------------------- |
| Risk-free rate  | UST 10Y       | China 10Y CGB        |
| ERP             | 5-6%          | 6-8% (higher for EM) |
| Terminal growth | 2-3%          | 3-4%                 |
| Tax rate        | 21% (federal) | 25% (15% for 高新)   |
| Currency        | USD           | CNY                  |
| Revenue units   | $M            | 万元 / 亿元          |

### Quick Workflow

1. **Project FCF** — 5-year explicit period
2. **Calculate WACC** — Use China parameters
3. **Discount FCF** — PV of explicit period
4. **Terminal value** — Gordon growth or exit multiple
5. **Enterprise value** — Sum of PVs
6. **Equity value** — EV - Net debt + Minority interest
7. **Value per share** — Equity value / Shares

### Common Pitfalls

| Pitfall                 | China-Specific Fix            |
| ----------------------- | ----------------------------- |
| Using US risk-free rate | Use China 10Y CGB             |
| Wrong tax rate          | Verify 高新 enterprise status |
| Revenue in USD          | Convert to CNY                |
| Ignoring 增值税         | Revenue should be net of VAT  |
| Western terminal growth | Use 3-4% for China            |

### For Full Details

See: `china-dcf/SKILL.md`

## Quality Checks

- [ ] All parameters China-appropriate
- [ ] FCF projections reasonable
- [ ] WACC components sourced
- [ ] Terminal growth < GDP growth
- [ ] Sensitivity analysis included
