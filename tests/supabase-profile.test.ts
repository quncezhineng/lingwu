import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { SupabaseAuth } from "../apps/server/src/supabase-auth.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(responses: Array<() => Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected Supabase request");
    return response();
  }) as typeof fetch;
  return calls;
}

const auth = new SupabaseAuth("https://example.supabase.co", "anon", "service");

test("updateProfile saves nickname and bio through the owner-scoped profile upsert", async () => {
  const calls = mockFetch([
    () => Response.json([{ nickname: "Old", bio: null, avatar_url: null }]),
    () => new Response(null, { status: 204 }),
    () =>
      Response.json([
        {
          nickname: "Lin",
          bio: "Long-term growth with risk control",
          avatar_url: null,
        },
      ]),
  ]);

  const profile = await auth.updateProfile("user-1", {
    nickname: "Lin",
    bio: "Long-term growth with risk control",
  });

  assert.equal(profile.displayName, "Lin");
  assert.equal(profile.bio, "Long-term growth with risk control");
  assert.equal(calls[1]?.url, "https://example.supabase.co/rest/v1/user_profiles?on_conflict=id");
  assert.equal(calls[1]?.init?.method, "POST");
  const headers = calls[1]?.init?.headers;
  assert.ok(headers);
  assert.match((headers as Record<string, string>).Prefer ?? "", /merge-duplicates/);
  const saved = JSON.parse(String(calls[1]?.init?.body));
  assert.equal(saved.id, "user-1");
  assert.equal(saved.nickname, "Lin");
  assert.equal(saved.bio, "Long-term growth with risk control");
  assert.equal(Number.isNaN(Date.parse(saved.updated_at)), false);
});

test("updateProfile can remove the current avatar", async () => {
  const calls = mockFetch([
    () =>
      Response.json([
        {
          nickname: "Old",
          bio: null,
          avatar_url: "user-1/old.png",
        },
      ]),
    () => new Response(null, { status: 204 }),
    () => Response.json({}),
    () => Response.json([{ nickname: "Lin", bio: null, avatar_url: null }]),
  ]);

  const profile = await auth.updateProfile("user-1", {
    nickname: "Lin",
    removeAvatar: true,
  });

  assert.equal(profile.avatarUrl, undefined);
  assert.equal(JSON.parse(String(calls[1]?.init?.body)).avatar_url, null);
  assert.equal(
    calls[2]?.url,
    "https://example.supabase.co/storage/v1/object/user-avatars/user-1/old.png",
  );
  assert.equal(calls[2]?.init?.method, "DELETE");
});

test("updateProfile uploads an avatar to the private bucket and returns a signed URL", async () => {
  const calls = mockFetch([
    () =>
      Response.json([
        {
          nickname: "Old",
          bio: null,
          avatar_url: "user-1/old.png",
        },
      ]),
    () => Response.json({ Key: "avatar.png" }),
    () => new Response(null, { status: 204 }),
    () => Response.json({}),
    () =>
      Response.json([
        {
          nickname: "Lin",
          bio: null,
          avatar_url: "user-1/avatar.png",
        },
      ]),
    () =>
      Response.json({
        signedURL: "/object/sign/user-avatars/user-1/avatar.png?token=test",
      }),
  ]);

  const profile = await auth.updateProfile("user-1", {
    nickname: "Lin",
    avatar: {
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
    },
  });

  assert.equal(
    profile.avatarUrl,
    "https://example.supabase.co/storage/v1/object/sign/user-avatars/user-1/avatar.png?token=test",
  );
  assert.match(
    calls[1]?.url ?? "",
    /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/user-avatars\/user-1\/.+\.png$/,
  );
  const upload = calls[1];
  assert.ok(upload);
  const headers = upload.init?.headers;
  assert.ok(headers);
  assert.equal((headers as Record<string, string>)["Content-Type"], "image/png");
  const uploaded = upload.init?.body;
  assert.ok(uploaded instanceof Blob);
  assert.deepEqual(
    new Uint8Array(await uploaded.arrayBuffer()),
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
  );
  assert.match(String(calls[2]?.init?.body), /"avatar_url":"user-1\/[^"]+\.png"/);
  assert.equal(
    calls[3]?.url,
    "https://example.supabase.co/storage/v1/object/user-avatars/user-1/old.png",
  );
});
