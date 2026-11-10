/**
 * 对话回复的公开分享页。
 *
 * 用户在对话里点「分享为链接」时，客户端把「提问 + 回复」写入 `shares` 集合，
 * 服务端返回一个不可猜的短 id；`GET /s/:id` 用这个 id 渲染一张无需登录即可
 * 阅读的静态页面，方便直接发给别人。
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
  .brand-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--primary); display: inline-block;
  }
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

/** 渲染一条分享的公开页面。 */
export function renderSharePage(record: ShareRecord): string {
  const question = record.question.trim();
  const summary = plainSummary(question || record.answer);
  const day = formatDay(record.createdAt);
  const body = `<div class="brand"><span class="brand-dot"></span>灵悟</div>
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
    body: `<div class="brand"><span class="brand-dot"></span>灵悟</div>
<article class="card"><p style="margin:0">这个分享不存在，或者已经失效了。</p></article>`,
  });
}

/**
 * 公开分享页，挂载在 `/s` 下（`GET /s/:id`）。
 *
 * 这条路由不在 `/api/*` 下，因此不会被父应用的鉴权中间件拦截：
 * 收件人拿到链接直接就能打开。
 */
export function sharePageRoutes(deps: { store: Store }): Hono {
  const app = new Hono();
  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!SHARE_ID_PATTERN.test(id)) return c.html(renderNotFound(), 404);
    const row = await deps.store.getByKindAndId<ShareRecord>(SHARES_KIND, id);
    if (!row) return c.html(renderNotFound(), 404);
    return c.html(renderSharePage(row.value));
  });
  return app;
}

/** 创建分享，挂载在 `/api/shares` 下（`POST /`）。需登录。 */
export function shareApiRoutes(deps: {
  store: Store;
  config: Pick<Config, "publicUrl">;
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
    return c.json({ id: record.id, url: `${deps.config.publicUrl}/s/${record.id}` }, 201);
  });
  return app;
}
