import { assistantMarkdown } from "./assistant-markdown";

const HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  // The opaque sandbox origin keeps generated pages away from the app's storage and DOM.
  "sandbox allow-scripts allow-forms allow-modals",
].join("; ");

export function sandboxedDocument(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}">`;
  const head = /<head(?:\s[^>]*)?>/i;
  if (head.test(html)) return html.replace(head, (match) => `${match}${meta}`);
  const htmlTag = /<html(?:\s[^>]*)?>/i;
  if (htmlTag.test(html)) return html.replace(htmlTag, (match) => `${match}<head>${meta}</head>`);
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render a Markdown file as a self-contained page for the new-tab preview. */
export function markdownPreviewDocument(markdown: string, title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f3ef; color: #20201d; font: 16px/1.75 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  main { width: min(820px, calc(100% - 32px)); margin: 28px auto 64px; padding: 40px 48px; background: #fff; border: 1px solid #dedbd3; border-radius: 16px; box-shadow: 0 16px 50px rgba(42, 36, 24, .08); }
  h1, h2, h3, h4, h5, h6 { line-height: 1.35; color: #151512; }
  h1 { margin: 0 0 24px; padding-bottom: 16px; border-bottom: 1px solid #e8e4da; font-size: 30px; }
  h2 { margin: 34px 0 12px; font-size: 23px; }
  h3 { margin: 26px 0 10px; font-size: 19px; }
  p { margin: 0 0 14px; }
  ul, ol { margin: 0 0 18px; padding-left: 26px; }
  li + li { margin-top: 6px; }
  a { color: #2456a6; text-underline-offset: 3px; }
  blockquote { margin: 20px 0; padding: 8px 18px; border-left: 4px solid #c9a34b; background: #fbf8ed; color: #625b4a; }
  code { padding: 2px 6px; border-radius: 5px; background: #efede7; color: #8d3128; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  pre { margin: 18px 0; padding: 16px 18px; overflow: auto; border-radius: 10px; background: #1f211f; color: #ecece7; }
  pre code { padding: 0; background: transparent; color: inherit; }
  table { width: 100%; margin: 20px 0; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 9px 12px; border: 1px solid #ddd8cc; text-align: left; vertical-align: top; }
  th { background: #f6f3eb; }
  img { max-width: 100%; height: auto; }
  hr { margin: 30px 0; border: 0; border-top: 1px solid #ddd8cc; }
  @media (max-width: 640px) {
    main { width: 100%; margin: 0; padding: 24px 20px 48px; border: 0; border-radius: 0; }
    h1 { font-size: 25px; }
    h2 { font-size: 20px; }
  }
</style>
</head>
<body><main>${assistantMarkdown.render(markdown)}</main></body>
</html>`;
}

/** Open a chat-local HTML source block as a sandboxed page in a new browser tab. */
export function openHtmlDocument(html: string): boolean {
  if (typeof window === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const url = URL.createObjectURL(
    new Blob([sandboxedDocument(html)], { type: "text/html;charset=utf-8" }),
  );
  const opened = window.open("about:blank", "_blank");
  if (!opened) {
    URL.revokeObjectURL(url);
    return false;
  }
  try {
    // Sever the opener before navigating the blank tab to the generated document.
    opened.opener = null;
    opened.location.replace(url);
  } catch {
    opened.close();
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
