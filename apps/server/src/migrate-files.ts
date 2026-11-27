/**
 * 把持久盘上已有的文件本体搬到 Supabase Storage。
 *
 * 为什么需要它：文件本体的存储切到 Supabase Storage 后，应用只认对象存储；原先落盘的
 * 历史文件不会自动过去。读取侧虽然会「远端读不到就回退本地盘」并顺手回填，但那只覆盖
 * 被访问到的文件——没被访问过的仍只存在于单块磁盘上。跑一次本脚本把存量全部搬过去，
 * 磁盘才真正可以丢，迁移才是完整的。
 *
 * 用法（在仓库根目录执行）：
 *   pnpm files:migrate
 *   DATA_DIR=/var/data/lingwu SUPABASE_URL=... SUPABASE_SECRET_KEY=... pnpm files:migrate
 *
 * 幂等、可重复执行：远端已存在的对象原样跳过（不上传、不覆盖）。
 */
import { readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { LocalBlobStore, SupabaseBlobStore } from "./blob-store.ts";

/** 需要搬运的两个目录：用户上传文件、电脑桌面截图。 */
const DIRECTORIES = ["files", "desktop-screens"] as const;

/** 地址脱敏后再打印，避免把密钥写进终端日志。 */
function mask(value: string): string {
  return value.replace(/\/\/[^@/]*@/, "//***@");
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !serviceRoleKey) {
    console.error(
      "[文件迁移] 缺少 SUPABASE_URL 与 SUPABASE_SECRET_KEY：未配置 Supabase 时文件本就存在本地盘，无需迁移。",
    );
    process.exit(1);
  }
  const root = resolve(process.env.DATA_DIR ?? ".lingwu");
  const local = new LocalBlobStore(root);
  const remote = new SupabaseBlobStore(url, serviceRoleKey, local);

  console.log(`[文件迁移] 源：本地盘 ${root}`);
  console.log(`[文件迁移] 目标：Supabase Storage ${mask(url)}`);

  let uploaded = 0;
  let skipped = 0;
  for (const directory of DIRECTORIES) {
    let names: string[];
    try {
      // 递归列出目录内所有条目（含子目录）；目录不存在就跳过。
      names = (await readdir(join(root, directory), { recursive: true })) as string[];
    } catch {
      continue;
    }
    for (const name of names) {
      // 目录条目读不出字节，local.get 会返回 null，下面直接跳掉。
      const key = `${directory}/${name.split(sep).join("/")}`;
      const bytes = await local.get(key);
      if (!bytes) continue;
      if (await remote.create(key, bytes)) uploaded += 1;
      else skipped += 1;
    }
  }
  console.log(`[文件迁移] 完成：新上传 ${uploaded} 个，远端已存在跳过 ${skipped} 个。`);
}

await main();
