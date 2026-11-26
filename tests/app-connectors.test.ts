import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import type { Config } from "../apps/server/src/config.ts";
import { APP_CONNECTORS } from "../apps/server/src/connectors/catalog.ts";
import { setMailTransport } from "../apps/server/src/connectors/mail.ts";
import {
  connectConnector,
  connectionGuidance,
  disconnectConnector,
  invokeConnection,
  listConnectors,
} from "../apps/server/src/connectors/service.ts";
import type { Store } from "../apps/server/src/db.ts";
import { decryptSecret } from "../packages/integrations/src/vault.ts";

const encryptionKey = randomBytes(32).toString("base64");
const config = { encryptionKey, publicUrl: "https://lingwu-tick.myfund.dev" } as Config;

function memoryDb() {
  type Row = {
    id: string;
    secret: string;
    tools: { name: string; description?: string; params?: string }[];
  };
  const rows = new Map<string, Row>();
  return {
    rows,
    db: {
      async get(_owner: string, _kind: string, id: string) {
        return rows.get(id) ?? null;
      },
      async put(_owner: string, _kind: string, value: { id: string }) {
        rows.set(value.id, value as Row);
        return value;
      },
      async remove(_owner: string, _kind: string, id: string) {
        rows.delete(id);
      },
      async list() {
        return [...rows.values()];
      },
    } as unknown as Store,
  };
}

function mcpFetch(token: string): typeof fetch {
  return (async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      method?: string;
      params?: { name?: string };
    };
    const result =
      body.method === "tools/list"
        ? {
            tools: [
              { name: "income", description: "利润表" },
              { name: "trade_cal", description: "日历" },
            ],
          }
        : body.method === "tools/call"
          ? { content: [{ type: "text", text: `value ${token}` }] }
          : {};
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("the catalog ports every mybots connection and keeps slugs unique", () => {
  const slugs = APP_CONNECTORS.map((item) => item.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of [
    "tushare",
    "tavily",
    "fmp",
    "yingmi",
    "hithink",
    "pandadata",
    "dingtalk",
    "dingdoc",
    "dingtable",
    "google-drive",
    "gsheets",
    "docling",
    "files",
    "ledger",
    "qqmail",
    "netease",
    "gmailbox",
    "outlook",
    "sinamail",
    "sohumail",
    "gmail-mcp",
    "notion",
    "github",
  ])
    assert.ok(slugs.includes(slug), slug);
});

test("a connected MCP key is encrypted, callable, and absent from the catalog response", async () => {
  const { db, rows } = memoryDb();
  const token = "abcdabcdabcdabcd";
  const deps = { db, config, fetcher: mcpFetch(token) };
  const connected = await connectConnector(deps, "owner-1", "tushare", { token });
  assert.equal(connected.connected, true);
  const saved = rows.get("tushare");
  assert.ok(saved);
  assert.equal(JSON.parse(decryptSecret(saved.secret, encryptionKey)).token, token);
  const listed = await listConnectors(deps, "owner-1");
  assert.equal(JSON.stringify(listed).includes(token), false);
  assert.equal(listed.find((item) => item.slug === "tushare")?.connected, true);
  const called = await invokeConnection(deps, "owner-1", "tushare", "income", {
    code: "000001.SZ",
  });
  assert.match(JSON.stringify(called), /value \*\*\*/);
  assert.equal(JSON.stringify(called).includes(token), false);
  const guide = await connectionGuidance(db, "owner-1");
  assert.match(guide, /use_connection/);
  assert.match(guide, /tushare/);
  await disconnectConnector(deps, "owner-1", "tushare");
  assert.equal(
    (await listConnectors(deps, "owner-1")).find((item) => item.slug === "tushare")?.connected,
    false,
  );
});

test("oauth cards stay visible and explain the missing callback instead of storing a secret", async () => {
  const { db, rows } = memoryDb();
  const deps = { db, config };
  const listed = await listConnectors(deps, "owner-1");
  const panda = listed.find((item) => item.slug === "pandadata");
  assert.ok(panda);
  assert.match(
    panda.missing.join(" "),
    /lingwu-tick\.myfund\.dev\/api\/app-connectors\/oauth\/callback/,
  );
  await assert.rejects(() => connectConnector(deps, "owner-1", "pandadata", {}), /PandaData/);
  assert.equal(rows.has("pandadata"), false);
  const drive = listed.find((item) => item.slug === "google-drive");
  assert.match(drive?.missing.join(" ") ?? "", /Drive/);
});

test("account file connections read only this owner's text files", async () => {
  const { db } = memoryDb();
  const deps = {
    db,
    config,
    files: {
      async list() {
        return [{ id: "f1", name: "notes.txt", mimeType: "text/plain" }];
      },
      async bytes() {
        return new TextEncoder().encode("营业收入 10");
      },
    },
  };
  await connectConnector(deps, "owner-1", "files", {});
  const listed = await invokeConnection(
    { ...deps, owner: "owner-1" },
    "owner-1",
    "files",
    "list_files",
  );
  assert.match(JSON.stringify(listed), /notes\.txt/);
  const read = await invokeConnection(
    { ...deps, owner: "owner-1" },
    "owner-1",
    "files",
    "read_file",
    { filename: "notes.txt" },
  );
  assert.match(JSON.stringify(read), /营业收入 10/);
});

test("mailbox cards reject a mismatched address before contacting the server", async () => {
  let called = false;
  setMailTransport({
    async check() {
      called = true;
    },
    async recent() {
      return [];
    },
    async read() {
      throw new Error("missing");
    },
  });
  const { db } = memoryDb();
  await assert.rejects(
    () =>
      connectConnector({ db, config }, "owner-1", "qqmail", {
        email: "person@gmail.com",
        code: "abcdefgh",
      }),
    /不一致/,
  );
  assert.equal(called, false);
  setMailTransport(null);
});

/**
 * 同花顺一个 Key 覆盖八个按数据域拆开的 MCP 端点。这个 fetcher 只给 a-share 与 fund
 * 两个域配工具，其余域回空清单，并把每次请求的路径记下来，用来核对调用落在哪个端点。
 */
function hithinkFetch(paths: string[]): typeof fetch {
  const toolsByPath: Record<string, { name: string; description: string }[]> = {
    "/mcp/a-share": [
      { name: "get_a_share_financials_income_statements", description: "利润表" },
      { name: "get_a_share_prices_snapshot", description: "行情快照，与内置行情重叠" },
    ],
    "/mcp/fund": [{ name: "get_fund_profile_detail", description: "基金资料" }],
  };
  return (async (url, init) => {
    const path = new URL(String(url)).pathname;
    paths.push(path);
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      method?: string;
      params?: { name?: string };
    };
    const result =
      body.method === "tools/list"
        ? { tools: toolsByPath[path] ?? [] }
        : body.method === "tools/call"
          ? { content: [{ type: "text", text: `${path} ${body.params?.name ?? ""}` }] }
          : {};
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("hithink joins eight domains on one key and calls each tool on its own endpoint", async () => {
  const { db } = memoryDb();
  const paths: string[] = [];
  const deps = { db, config, fetcher: hithinkFetch(paths) };
  const token = "hithinkkey123456";
  const connected = await connectConnector(deps, "owner-1", "hithink", { token });
  assert.equal(connected.connected, true);
  // 行情快照和内置行情重叠，连接时就被挡掉；财务与基金工具留下。
  assert.equal(connected.toolCount, 2);
  paths.length = 0;
  const fund = await invokeConnection(deps, "owner-1", "hithink", "get_fund_profile_detail", {});
  assert.match(JSON.stringify(fund), /\/mcp\/fund get_fund_profile_detail/);
  assert.deepEqual([...new Set(paths)], ["/mcp/fund"]);
  const blocked = await invokeConnection(
    deps,
    "owner-1",
    "hithink",
    "get_a_share_prices_snapshot",
    {},
  );
  assert.match(JSON.stringify(blocked), /没有 get_a_share_prices_snapshot/);
});

test("hithink stops at the first invalid key instead of probing all eight endpoints", async () => {
  const { db } = memoryDb();
  const paths: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    paths.push(new URL(String(url)).pathname);
    return new Response(JSON.stringify({ error: "Invalid or revoked API key" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  await assert.rejects(
    () => connectConnector({ db, config, fetcher }, "owner-1", "hithink", { token: "badkey1234" }),
    /Invalid or revoked API key/,
  );
  assert.deepEqual(paths, ["/mcp/a-share"]);
});

/**
 * 上游工具把必填项写在 inputSchema 里。以前 tools/list 只留 name + description，
 * 模型看不到 report 必填，于是只传 thscode，被上游回「Missing required argument: report」。
 */
function indicatorsFetch(): typeof fetch {
  return (async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      method?: string;
      params?: { arguments?: Record<string, unknown> };
    };
    const result =
      body.method === "tools/list"
        ? {
            tools: [
              {
                name: "get_a_share_financials_indicators",
                description: "财务指标数据",
                inputSchema: {
                  type: "object",
                  properties: { thscode: { type: "string" }, report: { type: "string" } },
                  required: ["thscode", "report"],
                },
              },
            ],
          }
        : body.method === "tools/call"
          ? body.params?.arguments?.report
            ? { content: [{ type: "text", text: '{"code":0}' }] }
            : {
                isError: true,
                content: [
                  { type: "text", text: "Invalid arguments: Missing required argument: report" },
                ],
              }
          : {};
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("a tool list carries its required arguments and a missing one comes back as a hint", async () => {
  const { db, rows } = memoryDb();
  const deps = { db, config, fetcher: indicatorsFetch() };
  await connectConnector(deps, "owner-1", "tushare", { token: "abcdabcdabcdabcd" });
  const listed = await invokeConnection(deps, "owner-1", "tushare");
  assert.match(JSON.stringify(listed), /thscode:string!, report:string!/);
  const rejected = await invokeConnection(
    deps,
    "owner-1",
    "tushare",
    "get_a_share_financials_indicators",
    { thscode: "000333.SZ" },
  );
  assert.match(
    JSON.stringify(rejected),
    /Missing required argument: report.*缺少必填参数 report.*report:string!/,
  );
  // 老连接是没存参数签名的，缺参数时按工具所在端点补一次并写回缓存。
  const saved = rows.get("tushare");
  assert.ok(saved);
  saved.tools = saved.tools.map(({ name, description }) => ({ name, description }));
  await invokeConnection(deps, "owner-1", "tushare", "get_a_share_financials_indicators", {
    thscode: "000333.SZ",
  });
  assert.match(JSON.stringify(rows.get("tushare")?.tools), /report:string!/);
  const called = await invokeConnection(
    deps,
    "owner-1",
    "tushare",
    "get_a_share_financials_indicators",
    { thscode: "000333.SZ", report: "2025-1" },
  );
  assert.match(JSON.stringify(called), /code/);
});
