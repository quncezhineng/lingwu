/**
 * 对话回复的公开分享页。
 *
 * 用户在对话里点「分享为链接」时，客户端把「提问 + 回复」写入 `shares` 集合，
 * 服务端返回一个不可猜的短 id；`GET /s/:id` 用这个 id 渲染一张无需登录即可
 * 阅读的静态页面，方便直接发给别人。链接域名用 `PUBLIC_WEB_URL`（前端域名），
 * 收件人打开的是前端地址；Web 端由 SPA 以 iframe 加载本页面内容。
 *
 * 安全约定：
 * - 分享 id 由服务端用 12 字节随机数生成（base64url，16 字符），无法枚举；
 * - Markdown 渲染关闭原始 HTML（`html: false`），提问文本额外做 HTML 转义；
 * - 页面加 `noindex`，链接可转发但不进搜索引擎索引。
 */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import MarkdownIt from "markdown-it";
import { z } from "zod";
import type { Config } from "./config.ts";
import type { Store } from "./db.ts";

type Env = { Variables: { owner: string } };

/** 分享记录。`id` 同时是数据库主键与 URL 路径段。 */
export interface ShareRecord {
  id: string;
  /** 用户提问；可能为空（例如会话首条就是助手消息）。 */
  question: string;
  /** 助手回复的原始 Markdown。 */
  answer: string;
  createdAt: string;
}

const SHARES_KIND = "shares";
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;
/** 单条分享的体积上限：正文 6 万字，足够覆盖长研报，又避免把库撑爆。 */
const shareInputSchema = z.object({
  question: z.string().trim().max(4000).default(""),
  answer: z.string().trim().min(1).max(60_000),
});

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: false });

/**
 * 灵悟品牌 logo（与 apps/mobile/assets/logo.svg 一致）。
 * 分享页由 API 服务端渲染、无静态资源路由，故将 SVG 以 data URI 内联，
 * 不发起额外请求，也避免跨域图片外链。
 */
const BRAND_LOGO_SVG = `<svg width="480" height="480" viewBox="0 0 480 480" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="480" height="480" rx="100" fill="#3A83F7" fill-opacity="0.996078"/>
<rect x="90" y="60" width="300" height="360" rx="100" fill="#3A83F7" fill-opacity="0.996078"/>
<path opacity="0.5" d="M122.178 274.519C128.982 281.283 128.982 292.25 122.178 299.014L121.83 299.361C115.026 306.125 103.996 306.125 97.1923 299.36C90.3889 292.596 90.389 281.629 97.1925 274.865L97.541 274.519C104.344 267.755 115.375 267.755 122.178 274.519Z" fill-rule="evenodd" clip-rule="evenodd" fill="url(#paint0_linear_3207_88)"/>
<path opacity="0.7" d="M204.074 279.734C210.865 286.51 210.845 297.477 204.029 304.229L155.772 352.034C148.957 358.786 137.926 358.766 131.135 351.99C124.344 345.214 124.364 334.247 131.18 327.495L179.437 279.69C186.252 272.938 197.283 272.958 204.074 279.734Z" fill-rule="evenodd" clip-rule="evenodd" fill="url(#paint1_linear_3207_88)"/>
<path opacity="0.5" d="M269.568 362.029C274.905 354.069 285.722 351.919 293.727 357.225L294.773 357.918C302.778 363.224 304.942 373.978 299.604 381.937C294.267 389.897 283.451 392.047 275.445 386.741L274.4 386.048C266.395 380.742 264.231 369.988 269.568 362.029Z" fill-rule="evenodd" clip-rule="evenodd" fill="url(#paint2_linear_3207_88)"/>
<path opacity="0.7" d="M384.546 273.478C391.35 280.243 391.35 291.209 384.546 297.974L360.853 321.53C354.05 328.294 343.019 328.294 336.216 321.53C329.412 314.766 329.412 303.799 336.216 297.035L359.909 273.478C366.712 266.714 377.743 266.714 384.546 273.478Z" fill-rule="evenodd" clip-rule="evenodd" fill="url(#paint3_linear_3207_88)"/>
<path d="M384.902 186.355C391.706 193.119 391.706 204.086 384.902 210.85L209.818 384.923C203.015 391.688 191.984 391.688 185.181 384.923C178.377 378.159 178.377 367.192 185.181 360.428L360.265 186.355C367.068 179.591 378.099 179.591 384.902 186.355Z" fill-rule="evenodd" clip-rule="evenodd" fill="url(#paint4_linear_3207_88)"/>
<path d="M351.783 132.834C358.586 139.599 358.586 150.565 351.783 157.33L251.088 257.443C244.284 264.208 233.254 264.208 226.45 257.443C219.647 250.679 219.647 239.712 226.45 232.948L327.146 132.834C333.949 126.07 344.979 126.07 351.783 132.834Z" fill-rule="evenodd" clip-rule="evenodd" fill="url(#paint5_linear_3207_88)"/>
<path d="M298.645 98.8784C305.453 105.638 305.46 116.605 298.661 123.374L169.221 252.24C162.422 259.009 151.392 259.016 144.584 252.256C137.776 245.497 137.768 234.53 144.567 227.761L274.007 98.8948C280.806 92.1261 291.837 92.1188 298.645 98.8784Z" fill-rule="evenodd" clip-rule="evenodd" fill="url(#paint6_linear_3207_88)"/>
<path opacity="0.7" d="M170.457 140.131C177.249 146.907 177.23 157.874 170.415 164.626L119.719 214.856C112.904 221.609 101.873 221.59 95.0814 214.814C88.2897 208.038 88.3087 197.071 95.1238 190.319L145.82 140.089C152.635 133.336 163.666 133.355 170.457 140.131Z" fill-rule="evenodd" clip-rule="evenodd" fill="url(#paint7_linear_3207_88)"/>
<path opacity="0.5" d="M201.503 90.0024C211.125 90.0024 218.925 97.7572 218.925 107.323V109.055C218.925 118.621 211.125 126.376 201.503 126.376C191.882 126.376 184.082 118.621 184.082 109.055V107.323C184.082 97.7572 191.882 90.0024 201.503 90.0024Z" fill-rule="evenodd" clip-rule="evenodd" fill="url(#paint8_linear_3207_88)"/>
<defs>
<linearGradient id="paint0_linear_3207_88" x1="109.685" y1="269.446" x2="109.685" y2="304.434" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0.8"/>
<stop offset="1" stop-color="white" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="paint1_linear_3207_88" x1="167.605" y1="274.639" x2="167.605" y2="357.085" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0.8"/>
<stop offset="1" stop-color="white" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="paint2_linear_3207_88" x1="284.586" y1="354.314" x2="284.586" y2="389.652" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0.8"/>
<stop offset="1" stop-color="white" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="paint3_linear_3207_88" x1="360.381" y1="268.405" x2="360.381" y2="326.603" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0.8"/>
<stop offset="1" stop-color="white" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="paint4_linear_3207_88" x1="285.042" y1="181.282" x2="285.042" y2="389.997" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0.8"/>
<stop offset="1" stop-color="white" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="paint5_linear_3207_88" x1="289.117" y1="127.761" x2="289.117" y2="262.517" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0.8"/>
<stop offset="1" stop-color="white" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="paint6_linear_3207_88" x1="221.614" y1="93.8135" x2="221.614" y2="257.321" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0.8"/>
<stop offset="1" stop-color="white" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="paint7_linear_3207_88" x1="132.769" y1="135.037" x2="132.769" y2="219.908" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0.8"/>
<stop offset="1" stop-color="white" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="paint8_linear_3207_88" x1="201.503" y1="90.0024" x2="201.503" y2="126.376" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0.8"/>
<stop offset="1" stop-color="white" stop-opacity="0.5"/>
</linearGradient>
</defs>
</svg>`;
const BRAND_LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(BRAND_LOGO_SVG)}`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 把 Markdown 压成纯文本，用于 `<meta description>` 与分享卡片摘要。 */
function plainSummary(value: string, limit = 140): string {
  const text = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\s*-]+/gm, " ")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const PAGE_STYLES = `
  :root {
    --canvas: #F8F8F8;
    --paper: #FFFFFF;
    --text: #303030;
    --muted: #696969;
    --line: #E6E6E6;
    --soft: #F6F6F6;
    --primary: #3A83F7;
    --primary-strong: #245FC4;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--canvas);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
    font-size: 15px;
    line-height: 1.75;
    -webkit-font-smoothing: antialiased;
  }
  .page { max-width: 720px; margin: 0 auto; padding: 40px 20px 56px; }
  .brand {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 16px; font-size: 13px; letter-spacing: .02em;
    color: var(--muted);
  }
  .brand-logo {
    width: 22px; height: 22px; flex-shrink: 0;
    display: inline-block; border-radius: 6px;
  }
  .brand-home {
    margin-left: auto;
    font-size: 13px; letter-spacing: normal; color: var(--primary-strong);
    text-decoration: none;
    border: 1px solid var(--line); border-radius: 999px;
    background: var(--paper);
    padding: 4px 14px; line-height: 1.6;
  }
  .brand-home:hover { border-color: var(--primary); }
  .card {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 22px 24px;
  }
  .ask {
    background: var(--soft);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 20px;
  }
  .ask-label {
    font-size: 11px; letter-spacing: .04em; color: var(--muted);
    margin-bottom: 5px;
  }
  .ask-text { margin: 0; font-size: 15px; line-height: 1.7; white-space: pre-wrap; }
  .answer > :first-child { margin-top: 0; }
  .answer > :last-child { margin-bottom: 0; }
  .answer p { margin: 0 0 12px; }
  .answer h1, .answer h2, .answer h3, .answer h4 {
    margin: 24px 0 10px; line-height: 1.4; font-weight: 600; color: #1F1F1F;
  }
  .answer h1 { font-size: 22px; }
  .answer h2 { font-size: 19px; }
  .answer h3 { font-size: 17px; }
  .answer h4 { font-size: 15px; }
  .answer ul, .answer ol { margin: 0 0 12px; padding-left: 22px; }
  .answer li { margin: 4px 0; }
  .answer a { color: var(--primary-strong); text-decoration: underline; }
  .answer strong { font-weight: 600; }
  .answer blockquote {
    margin: 12px 0; padding: 10px 14px;
    border-left: 3px solid var(--line);
    background: var(--soft); border-radius: 6px;
    color: var(--muted);
  }
  .answer code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    background: #EEEEEE; color: var(--primary-strong);
    border-radius: 5px; padding: 1px 5px;
  }
  .answer pre {
    background: #EEEEEE; border: 1px solid var(--line); border-radius: 10px;
    padding: 12px 14px; overflow-x: auto; margin: 0 0 14px;
  }
  .answer pre code { background: none; padding: 0; color: var(--text); }
  .answer table {
    width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 14px;
  }
  .answer th, .answer td {
    border: 1px solid var(--line); padding: 7px 10px; text-align: left;
  }
  .answer th { background: var(--soft); font-weight: 600; }
  .answer hr { border: 0; border-top: 1px solid var(--line); margin: 20px 0; }
  .answer img { max-width: 100%; height: auto; border-radius: 8px; }
  .foot {
    margin-top: 18px; font-size: 12px; color: var(--muted); text-align: center;
  }
  @media (max-width: 480px) {
    .page { padding: 24px 14px 40px; }
    .card { padding: 18px 16px; border-radius: 10px; }
  }
`;

function renderShell(options: { title: string; description: string; body: string }): string {
  const { title, description, body } = options;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta name="twitter:card" content="summary" />
<style>${PAGE_STYLES}</style>
</head>
<body>
<main class="page">
${body}
</main>
</body>
</html>`;
}

/** 渲染一条分享的公开页面。`homeUrl` 是前端主页地址，「进入主页」按钮的跳转目标。 */
export function renderSharePage(record: ShareRecord, homeUrl: string): string {
  const question = record.question.trim();
  const summary = plainSummary(question || record.answer);
  const day = formatDay(record.createdAt);
  const body = `<div class="brand"><img class="brand-logo" src="${BRAND_LOGO_DATA_URI}" alt="灵悟" />灵悟<a class="brand-home" href="${escapeHtml(homeUrl)}" target="_top">进入主页</a></div>
<article class="card">
${
  question
    ? `<section class="ask"><div class="ask-label">提问</div><p class="ask-text">${escapeHtml(question)}</p></section>`
    : ""
}
<section class="answer">${markdown.render(record.answer)}</section>
</article>
<footer class="foot">由灵悟生成${day ? ` · ${day}` : ""}</footer>`;
  return renderShell({
    title: question ? plainSummary(question, 48) : "灵悟 · 对话分享",
    description: summary || "由灵悟生成的对话分享。",
    body,
  });
}

function renderNotFound(): string {
  return renderShell({
    title: "分享不存在或已失效",
    description: "这个分享链接无效。",
    body: `<div class="brand"><img class="brand-logo" src="${BRAND_LOGO_DATA_URI}" alt="灵悟" />灵悟</div>
<article class="card"><p style="margin:0">这个分享不存在，或者已经失效了。</p></article>`,
  });
}

/**
 * 公开分享页，挂载在 `/s` 下（`GET /s/:id`）。
 *
 * 这条路由不在 `/api/*` 下，因此不会被父应用的鉴权中间件拦截：
 * 收件人拿到链接直接就能打开。
 */
export function sharePageRoutes(deps: {
  store: Store;
  // 「进入主页」按钮的目标地址：优先前端域名（PUBLIC_WEB_URL），未配置时回退 API 域名。
  config: { webUrl?: string; publicUrl: string };
}): Hono {
  const homeUrl = deps.config.webUrl ?? deps.config.publicUrl;
  const app = new Hono();
  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!SHARE_ID_PATTERN.test(id)) return c.html(renderNotFound(), 404);
    const row = await deps.store.getByKindAndId<ShareRecord>(SHARES_KIND, id);
    if (!row) return c.html(renderNotFound(), 404);
    return c.html(renderSharePage(row.value, homeUrl));
  });
  return app;
}

/** 创建分享，挂载在 `/api/shares` 下（`POST /`）。需登录。 */
export function shareApiRoutes(deps: {
  store: Store;
  // 优先用前端域名（PUBLIC_WEB_URL）；未配置时回退 API 域名，保持向后兼容。
  config: { webUrl?: string; publicUrl: string };
}): Hono<Env> {
  const app = new Hono<Env>();
  app.post("/", async (c) => {
    const input = shareInputSchema.parse(await c.req.json());
    const record: ShareRecord = {
      id: randomBytes(12).toString("base64url"),
      question: input.question,
      answer: input.answer,
      createdAt: new Date().toISOString(),
    };
    await deps.store.put(c.get("owner"), SHARES_KIND, record);
    // 指向前端域名：收件人打开的地址与 App 同源；Web 端 SPA 会兜住 /s/:id 并展示内容。
    const baseUrl = deps.config.webUrl ?? deps.config.publicUrl;
    return c.json({ id: record.id, url: `${baseUrl}/s/${record.id}` }, 201);
  });
  return app;
}
