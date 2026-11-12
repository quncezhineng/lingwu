/** Streamable HTTP MCP. Tokens stay in the request, never in thrown messages. */

const PROTOCOL = "2025-03-26";

export type McpAuth = "query" | "bearer" | "header" | "url";

export type McpTool = { name: string; description: string };

export class McpError extends Error {
  constructor(
    message: string,
    readonly code = "upstream",
  ) {
    super(message);
    this.name = "McpError";
  }
}

export type McpFetch = typeof fetch;

function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 6) out = out.split(secret).join("***");
  }
  return out.replace(/(token|apikey|api_key|key)=[^&\s"']+/gi, "$1=***").slice(0, 400);
}

function endpointUrl(endpoint: string, auth: McpAuth, token: string): string {
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new McpError("连接只接受 https 地址");
  if (auth === "query") {
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    url.searchParams.delete("token");
    url.searchParams.set("token", token);
  } else if (auth === "url") {
    if (!url.searchParams.get("key")) throw new McpError("个人 MCP 地址需要带 ?key=");
  } else {
    url.searchParams.delete("token");
    url.searchParams.delete("tavilyApiKey");
    url.searchParams.delete("apiKey");
    url.searchParams.delete("api_key");
  }
  return url.toString();
}

function parseBody(raw: string, contentType: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) return null;
  let blob = text;
  if (
    contentType.includes("text/event-stream") ||
    text.startsWith("data:") ||
    text.startsWith("event:")
  ) {
    blob = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]")
      .join("\n");
    if (!blob) return null;
  }
  const parsed = JSON.parse(blob) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new McpError("MCP 响应格式不正确");
  return parsed as Record<string, unknown>;
}

export function assertDingUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new McpError("请粘贴完整的 https MCP 地址");
  }
  if (
    url.protocol !== "https:" ||
    !url.pathname.startsWith("/server/") ||
    !url.searchParams.get("key")
  )
    throw new McpError("请从钉钉 MCP 市场复制完整的个人地址，路径以 /server/ 开头，并包含 ?key=");
  return url.toString();
}

export async function mcpSession(
  endpoint: string,
  token: string,
  auth: McpAuth,
  fetcher: McpFetch = fetch,
): Promise<{
  tools: () => Promise<McpTool[]>;
  call: (name: string, args: Record<string, unknown>) => Promise<string>;
}> {
  const url = endpointUrl(endpoint, auth, token);
  const secrets = [token, url];
  let sessionId = "";
  let nextId = 0;
  const headers = (): Record<string, string> => {
    const value: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL,
    };
    if (sessionId) value["Mcp-Session-Id"] = sessionId;
    if (auth === "bearer" && token) value.Authorization = `Bearer ${token}`;
    if (auth === "header" && token) value["x-api-key"] = token;
    return value;
  };
  const post = async (payload: unknown): Promise<Record<string, unknown> | null> => {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "POST",
        headers: headers(),
        body: payload === undefined ? undefined : JSON.stringify(payload),
        redirect: "manual",
      });
    } catch {
      throw new McpError("MCP 网络请求失败", "network");
    }
    if (response.status >= 300 && response.status < 400)
      throw new McpError("MCP 拒绝跳转到其他地址", "network");
    const nextSession = response.headers.get("mcp-session-id");
    if (nextSession) sessionId = nextSession;
    const raw = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = parseBody(raw, response.headers.get("content-type") ?? "");
    } catch {
      if (response.status >= 400) throw new McpError(redact(raw || "凭证被拒绝", secrets));
      throw new McpError("MCP 响应不是 JSON");
    }
    if (response.status >= 400) {
      const message =
        typeof parsed?.error === "string"
          ? parsed.error
          : parsed?.error && typeof parsed.error === "object"
            ? String((parsed.error as { message?: string }).message ?? "凭证被拒绝")
            : raw || "凭证被拒绝";
      throw new McpError(
        redact(message, secrets),
        response.status === 401 ? "invalid_token" : "upstream",
      );
    }
    return parsed;
  };
  const rpc = async (method: string, params: Record<string, unknown>) => {
    nextId += 1;
    const parsed = await post({ jsonrpc: "2.0", id: nextId, method, params });
    if (!parsed) throw new McpError("MCP 响应为空");
    if (parsed.error) {
      const message =
        typeof parsed.error === "string"
          ? parsed.error
          : String((parsed.error as { message?: string }).message ?? "MCP 调用失败");
      throw new McpError(redact(message, secrets));
    }
    const result = parsed.result;
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new McpError("MCP 响应缺少 result");
    return result as Record<string, unknown>;
  };
  await rpc("initialize", {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: "lingwu", version: "1" },
  });
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  return {
    tools: async () => {
      const result = await rpc("tools/list", {});
      const batch = Array.isArray(result.tools) ? result.tools : [];
      return batch
        .filter(
          (item): item is { name?: string; description?: string } =>
            !!item && typeof item === "object",
        )
        .map((item) => ({
          name: String(item.name ?? "").slice(0, 80),
          description: String(item.description ?? "").slice(0, 240),
        }))
        .filter((item) => item.name)
        .slice(0, 24);
    },
    call: async (name, args) => {
      const result = await rpc("tools/call", { name, arguments: args });
      if (result.isError) throw new McpError(redact(contentText(result), secrets));
      return redact(contentText(result), secrets).slice(0, 6000);
    },
  };
}

function contentText(result: Record<string, unknown>): string {
  const content = result.content;
  if (!Array.isArray(content)) return JSON.stringify(result).slice(0, 4000);
  const parts = content.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && "text" in item) return String(item.text ?? "");
    return "";
  });
  const text = parts.filter(Boolean).join("\n").trim();
  return text || JSON.stringify(result).slice(0, 4000);
}
