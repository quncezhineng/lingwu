/**
 * 交付物只读分享页：`GET /d/:shareId`。
 *
 * 无需登录，但只展示已发送且锁定在发送版本的快照；页面固定渲染免责声明，
 * 关闭原始 HTML 与搜索引擎索引。
 */
import { Hono } from "hono";
import MarkdownIt from "markdown-it";
import type { DeliverablesService } from "./deliverables.ts";

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: false });

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLES = `
  :root { --canvas:#F8F8F8; --paper:#FFF; --text:#303030; --muted:#696969; --line:#E6E6E6; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--canvas); color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    font-size:15px; line-height:1.75; }
  .page { max-width:760px; margin:0 auto; padding:40px 20px 56px; }
  .brand { margin-bottom:18px; color:var(--muted); font-size:13px; }
  .brand strong { color:var(--text); letter-spacing:.08em; }
  .card { background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:28px; }
  .meta { display:flex; gap:8px; flex-wrap:wrap; color:var(--muted); font-size:12px; margin-bottom:10px; }
  .kind { border:1px solid var(--line); border-radius:999px; padding:1px 8px; }
  h1 { font-size:24px; line-height:1.35; margin:0 0 18px; color:#1f1f1f; }
  .prose h2 { font-size:18px; margin:24px 0 8px; }
  .prose h3 { font-size:16px; margin:20px 0 6px; }
  .prose p { margin:0 0 12px; }
  .prose ul, .prose ol { padding-left:22px; }
  .disclaimer { margin-top:24px; padding-top:16px; border-top:1px solid var(--line);
    color:var(--muted); font-size:12px; line-height:1.7; }
  .readonly { margin-top:18px; color:var(--muted); font-size:12px; }
  a { color:#245FC4; }
`;

export function deliverablePublicRoutes(deliverables: DeliverablesService) {
  const app = new Hono();
  app.get("/:id", async (c) => {
    const view = await deliverables.publicView(c.req.param("id"));
    if (!view)
      return c.html(
        `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>链接不可用</title></head><body><p>这条分享链接已失效或未获批准。</p></body></html>`,
        404,
      );
    return c.html(
      `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(view.title)} · 灵悟</title>
<style>${STYLES}</style>
</head><body><main class="page">
<div class="brand"><strong>灵悟 LINGWU</strong> · 只读分享</div>
<article class="card">
  <div class="meta"><span class="kind">${escapeHtml(view.kind)}</span><span>版本 v${view.version}</span><span>${escapeHtml(view.createdAt.slice(0, 10))}</span></div>
  <h1>${escapeHtml(view.title)}</h1>
  <div class="prose">${markdown.render(view.content)}</div>
  <div class="disclaimer">${escapeHtml(view.disclaimer)}</div>
  <div class="readonly">此页面为只读交付物，收件人不能编辑或下载原始工作区数据。</div>
</article>
</main></body></html>`,
    );
  });
  return app;
}
