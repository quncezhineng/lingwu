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
  const rows = new Map<string, { id: string; secret: string; tools: { name: string }[] }>();
  return {
    rows,
    db: {
      async get(_owner: string, _kind: string, id: string) {
        return rows.get(id) ?? null;
      },
      async put(_owner: string, _kind: string, value: { id: string }) {
        rows.set(value.id, value as { id: string; secret: string; tools: { name: string }[] });
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
