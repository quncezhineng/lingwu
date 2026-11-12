/** Account-wide connections ported from the mybots catalog. No secrets live here. */

export type ConnectorCategory =
  | "research-data"
  | "search"
  | "office"
  | "documents"
  | "files"
  | "development";

export type ConnectorAuth = "token" | "api_key" | "url" | "authcode" | "platform" | "oauth";

export type ConnectorTransport =
  | "mcp-query"
  | "mcp-bearer"
  | "mcp-header"
  | "mcp-url"
  | "fmp"
  | "mail"
  | "files"
  | "ledger"
  | "docling"
  | "oauth";

export type CatalogEntry = {
  slug: string;
  name: string;
  summary: string;
  category: ConnectorCategory;
  featured: boolean;
  auth: ConnectorAuth;
  transport: ConnectorTransport;
  endpoint?: string;
  hint: string;
  docsUrl?: string;
  mailDomains?: readonly string[];
  mailProtocol?: "imap" | "pop3";
  mailHost?: string;
  sort: number;
};

const mail = (
  slug: string,
  name: string,
  summary: string,
  hint: string,
  domains: readonly string[],
  host: string,
  protocol: "imap" | "pop3",
  sort: number,
  docsUrl: string,
): CatalogEntry => ({
  slug,
  name,
  summary,
  category: "office",
  featured: false,
  auth: "authcode",
  transport: "mail",
  hint,
  docsUrl,
  mailDomains: domains,
  mailHost: host,
  mailProtocol: protocol,
  sort,
});

const guide = "https://github.com/timecyber/email-mcp/blob/main/CONFIG_GUIDE.md";
const gmailHelp = "https://support.google.com/accounts/answer/185833";

export const APP_CONNECTORS: readonly CatalogEntry[] = [
  {
    slug: "tushare",
    name: "Tushare",
    summary: "官方 HTTP MCP。A股行情、日线和基金净值仍走内置数据，这里只补缺口。",
    category: "research-data",
    featured: true,
    auth: "token",
    transport: "mcp-query",
    endpoint: "https://api.tushare.pro/mcp/",
    hint: "打开 tushare.pro，进入个人中心 → MCP Server，复制 MCP key。",
    docsUrl: "https://tushare.pro/document/1?doc_id=463",
    sort: 10,
  },
  {
    slug: "tavily",
    name: "Tavily",
    summary: "官方 HTTP MCP。检索公开网页并保留来源链接，不回答行情和基金净值。",
    category: "search",
    featured: true,
    auth: "api_key",
    transport: "mcp-bearer",
    endpoint: "https://mcp.tavily.com/mcp/",
    hint: "到 tavily.com 的账户页面复制 API key。",
    docsUrl: "https://docs.tavily.com/documentation/mcp",
    sort: 15,
  },
  {
    slug: "fmp",
    name: "FMP",
    summary: "Financial Modeling Prep 稳定版接口。只补全球公司画像和财务报表，不提供行情。",
    category: "research-data",
    featured: true,
    auth: "api_key",
    transport: "fmp",
    endpoint: "https://financialmodelingprep.com/stable/",
    hint: "到 financialmodelingprep.com 的 Dashboard 复制 API key。key 只放在请求头里。",
    docsUrl: "https://site.financialmodelingprep.com/developer/docs/quickstart",
    sort: 16,
  },
  {
    slug: "yingmi",
    name: "盈米基金",
    summary: "盈米/且慢公募基金数据 MCP。用 API Key 连接。基金净值和基金详情仍走内置数据。",
    category: "research-data",
    featured: true,
    auth: "api_key",
    transport: "mcp-header",
    endpoint: "https://stargate.yingmi.com/mcp/v2",
    hint: "打开盈米 AI 开放平台（ai.yingmi.com）个人中心，复制 MCP API Key。",
    docsUrl: "https://github.com/yingmi-dev/Qieman-MCP",
    sort: 17,
  },
  {
    slug: "pandadata",
    name: "PandaData",
    summary: "PandaData 远程 MCP。登录授权后对话取数。A股行情、日线和基金净值仍走内置数据。",
    category: "research-data",
    featured: true,
    auth: "oauth",
    transport: "oauth",
    endpoint: "https://pandadatamcp.pandaaiquant.com/mcp",
    hint: "点「登录授权」，用你的 PandaAI 账号连接。不需要在这里粘贴密钥。",
    docsUrl: "https://www.pandaaiquant.com/docs/data",
    sort: 18,
  },
  {
    slug: "dingtalk",
    name: "钉钉办公",
    summary: "登录授权连接你的钉钉日历。也可以粘贴 MCP 市场的个人地址。只读，不会发消息。",
    category: "office",
    featured: true,
    auth: "url",
    transport: "mcp-url",
    hint: "可以粘贴 mcp.dingtalk.com 上带 ?key= 的个人 MCP 地址。登录授权还要对方接受本站回调。",
    docsUrl: "https://mcp.dingtalk.com",
    sort: 20,
  },
  {
    slug: "dingdoc",
    name: "钉钉文档",
    summary: "登录授权连接你的钉钉文档，或粘贴文档服务的个人 MCP 地址。只读。",
    category: "office",
    featured: false,
    auth: "url",
    transport: "mcp-url",
    hint: "粘贴文档服务的 Streamable HTTP 地址（含 ?key=），或等登录授权的回调登记完成。",
    docsUrl: "https://mcp.dingtalk.com",
    sort: 21,
  },
  {
    slug: "dingtable",
    name: "钉钉 AI 表格",
    summary: "登录授权连接你的钉钉 AI 表格，或粘贴个人 MCP 地址。只读。",
    category: "office",
    featured: false,
    auth: "url",
    transport: "mcp-url",
    hint: "粘贴 AI 表格的 Streamable HTTP 地址（含 ?key=），或等登录授权的回调登记完成。",
    docsUrl: "https://mcp.dingtalk.com",
    sort: 22,
  },
  {
    slug: "google-drive",
    name: "Google Drive",
    summary:
      "官方 Drive MCP。用你的 Google 账号登录后查找文件并读正文。不需要平台申请另一套 OAuth 应用。",
    category: "office",
    featured: false,
    auth: "oauth",
    transport: "oauth",
    endpoint: "https://drivemcp.googleapis.com/mcp/v1",
    hint: "点「登录授权」，用你自己的 Google 账号连接官方 Drive MCP。",
    docsUrl: "https://developers.google.com/workspace/drive/api/guides/configure-mcp-server",
    sort: 30,
  },
  {
    slug: "gsheets",
    name: "Google Sheets",
    summary: "官方 Sheets MCP。用你的 Google 账号登录后读取表格。不改表格。",
    category: "office",
    featured: false,
    auth: "oauth",
    transport: "oauth",
    endpoint: "https://sheetsmcp.googleapis.com/mcp/v1",
    hint: "点「登录授权」，用你自己的 Google 账号连接官方 Sheets MCP。",
    docsUrl: "https://developers.google.com/workspace/sheets/api/guides/configure-mcp-server",
    sort: 31,
  },
  {
    slug: "docling",
    name: "Docling",
    summary: "平台托管的 Docling Serve。解析 PDF、Word、Excel、PPT，并带来源定位。",
    category: "documents",
    featured: false,
    auth: "platform",
    transport: "docling",
    hint: "不用粘贴密钥。平台需设置 DOCLING_SERVE_URL，指向已托管的 Docling Serve。",
    docsUrl: "https://docling-project.github.io/docling/usage/api_server/rest_api/",
    sort: 40,
  },
  {
    slug: "files",
    name: "用户文件",
    summary: "读取当前账号上传的文本。不访问别人的文件。",
    category: "files",
    featured: false,
    auth: "platform",
    transport: "files",
    hint: "使用当前登录会话，不用粘贴密钥。",
    sort: 41,
  },
  {
    slug: "ledger",
    name: "持仓台账",
    summary: "读取 CSV 台账，核对资产分布和合计。不拉行情。",
    category: "research-data",
    featured: false,
    auth: "platform",
    transport: "ledger",
    hint: "使用当前登录会话。台账来自你上传的 CSV。",
    sort: 42,
  },
  mail(
    "qqmail",
    "QQ 邮箱",
    "用 QQ 或 Foxmail 地址和授权码连接。只读，不会发信。",
    "填写 QQ 邮箱或 foxmail.com 地址，以及授权码（不是 QQ 密码）。设置 → 账户 → 开启 IMAP/SMTP 后生成授权码。",
    ["qq.com", "foxmail.com"],
    "imap.qq.com",
    "imap",
    43,
    guide,
  ),
  mail(
    "netease",
    "网易邮箱（163 / 126 / yeah）",
    "用 163、126 或 yeah.net 地址和授权码连接。按 POP3 收信，不会发信。",
    "填写 163.com、126.com 或 yeah.net 地址，以及授权码（不是登录密码）。",
    ["163.com", "126.com", "yeah.net"],
    "pop.163.com",
    "pop3",
    44,
    guide,
  ),
  mail(
    "gmailbox",
    "Gmail 邮箱",
    "用 Gmail 地址和应用专用密码连接。只读，不会发信。已有的 Google 登录连接仍然保留。",
    "填写 Gmail 地址和应用专用密码（不是登录密码）。Google 账号 → 安全性 → 两步验证 → 应用专用密码。",
    ["gmail.com", "googlemail.com"],
    "imap.gmail.com",
    "imap",
    45,
    gmailHelp,
  ),
  mail(
    "outlook",
    "Outlook / Hotmail",
    "用 Outlook、Hotmail、Live 或 MSN 地址和应用专用密码连接。只读，不会发信。",
    "填写 Outlook、Hotmail、Live 或 MSN 地址，以及应用专用密码（不是登录密码）。",
    ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    "outlook.office365.com",
    "imap",
    46,
    guide,
  ),
  mail(
    "sinamail",
    "新浪邮箱",
    "用 sina.com 或 sina.cn 地址和授权码连接。只读，不会发信。",
    "填写新浪邮箱地址和授权码（不是登录密码）。",
    ["sina.com", "sina.cn"],
    "imap.sina.com",
    "imap",
    47,
    guide,
  ),
  mail(
    "sohumail",
    "搜狐邮箱",
    "用 sohu.com 地址和授权码连接。只读，不会发信。",
    "填写搜狐邮箱地址和授权码（不是登录密码）。",
    ["sohu.com"],
    "imap.sohu.com",
    "imap",
    48,
    guide,
  ),
  {
    slug: "gmail-mcp",
    name: "Gmail 官方 MCP",
    summary:
      "官方登录授权这一路还没有接上。个人邮箱请用「Gmail 邮箱」，或继续用已有的 Google 登录连接。不会发信。",
    category: "office",
    featured: false,
    auth: "oauth",
    transport: "oauth",
    hint: "登录授权目前不可用。请使用「Gmail 邮箱」填写应用专用密码，或使用已有的 Gmail 连接。",
    docsUrl: gmailHelp,
    sort: 50,
  },
  {
    slug: "notion",
    name: "Notion",
    summary: "官方远程 MCP。授权后只搜索和读取页面，不改页面。",
    category: "office",
    featured: false,
    auth: "oauth",
    transport: "oauth",
    endpoint: "https://mcp.notion.com/mcp",
    hint: "点「登录授权」，用你的 Notion 账号连接。",
    docsUrl: "https://developers.notion.com/guides/mcp/get-started-with-mcp",
    sort: 55,
  },
  {
    slug: "github",
    name: "GitHub",
    summary: "官方远程只读 MCP。查看仓库和 issue，不会改仓库。",
    category: "development",
    featured: false,
    auth: "token",
    transport: "mcp-bearer",
    endpoint: "https://api.githubcopilot.com/mcp/readonly",
    hint: "粘贴 GitHub 个人访问令牌（ghp_ 或 github_pat_）。连接的是只读地址。",
    docsUrl: "https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md",
    sort: 56,
  },
];

export function connectorBySlug(slug: string): CatalogEntry | undefined {
  return APP_CONNECTORS.find((item) => item.slug === slug);
}
