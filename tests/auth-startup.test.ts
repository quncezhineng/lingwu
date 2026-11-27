import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAuth } from "../apps/server/src/auth.ts";
import type { Config } from "../apps/server/src/config.ts";
import type { Store } from "../apps/server/src/db.ts";

function config(dataDir: string): Config {
  return {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir,
    agentBackend: "sample",
    allowedOrigins: [],
    googleRedirectUri: "http://localhost:8787/api/google/callback",
  };
}

test("concurrent first startups share one complete signing key", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "lingwu-auth-race-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const instances = await Promise.all(
    Array.from({ length: 16 }, () => createAuth({} as Store, config(directory))),
  );
  const key = await readFile(join(directory, "session-signing-key"), "utf8");
  assert.equal(Buffer.from(key, "base64").length, 32);
  for (const signer of instances) {
    const url = new URL(signer.sign("owner", "/api/files/example/content"));
    for (const verifier of instances) assert.equal(verifier.verify(url), "owner");
  }
  assert.deepEqual(await readdir(directory), ["session-signing-key"]);
});

test("startup preserves an existing signing key and its links", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "lingwu-auth-existing-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = Buffer.alloc(32, 7).toString("base64");
  await writeFile(join(directory, "session-signing-key"), key, { mode: 0o600 });
  const first = await createAuth({} as Store, config(directory));
  const url = new URL(first.sign("owner", "/api/files/example/content"));
  const second = await createAuth({} as Store, config(directory));
  assert.equal(second.verify(url), "owner");
  assert.equal(await readFile(join(directory, "session-signing-key"), "utf8"), key);
  assert.deepEqual(await readdir(directory), ["session-signing-key"]);
});

test("an injected signing key replaces the on-disk file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "lingwu-auth-injected-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = Buffer.alloc(32, 5).toString("base64");
  const injected = { ...config(directory), sessionSigningKey: key };
  const signer = await createAuth({} as Store, injected);
  const url = new URL(signer.sign("owner", "/api/files/example/content"));
  // 同一注入密钥的另一个实例能验签：证明密钥来自注入，而不是各自落盘生成。
  const verifier = await createAuth({} as Store, injected);
  assert.equal(verifier.verify(url), "owner");
  // 注入密钥时不再读写磁盘：目录里不留下任何密钥文件。
  await assert.rejects(readFile(join(directory, "session-signing-key"), "utf8"));
  assert.deepEqual(await readdir(directory), []);
});
