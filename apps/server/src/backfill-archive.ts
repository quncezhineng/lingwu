/**
 * 把 CopilotKit Intelligence 里已有的单聊历史一次性回填进本地归档。
 *
 * 为什么需要它：实时归档（见 `conversation-archive.ts`）只从上线那一刻开始记录，
 * 之前的历史仍然只存在于 CopilotKit 云端。跑一次本脚本把存量补进来，「永久保存」
 * 才是完整的——之后即使 Intelligence 项目被清空或停服，历史也有自有库副本。
 *
 * 用法（在仓库根目录执行）：
 *   pnpm archive:backfill
 *   DATABASE_URL='postgresql://...' CPK_INTELLIGENCE_API_KEY=... pnpm archive:backfill
 *
 * 幂等、可重复执行：归档按 messageId 覆盖写，跑几次都不会产生重复副本。
 * 只回填用户提问与助手回复的正文；工具消息等跳过（它们不是对话内容）。
 *
 * 注意：未配置 `DATABASE_URL` 时会写入本地嵌入式库（PGlite）。PGlite 是单写者，
 * 请先停掉正在运行的服务再执行，否则两个进程争用同一数据目录。
 */
import { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
import { ConversationArchive } from "./conversation-archive.ts";
import { createStore } from "./db.ts";

/** 每次向 Intelligence 要多少条线程；平台按页返回，靠 `nextCursor` 继续。 */
const PAGE_SIZE = 100;

/** 记录库地址脱敏后再打印，避免把密码写进终端日志。 */
function mask(value: string): string {
  return value.replace(/\/\/[^@/]*@/, "//***@");
}

async function main() {
  const apiKey = process.env.CPK_INTELLIGENCE_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "[归档回填] 缺少 CPK_INTELLIGENCE_API_KEY：历史在 CopilotKit 上，必须用同一个项目密钥才能读出来。",
    );
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.warn(
      "[归档回填] 未设置 DATABASE_URL：将写入本地嵌入式库（DATA_DIR）。请确认服务已停止，避免与 PGlite 争用数据目录。",
    );
  } else {
    console.log(`[归档回填] 目标：${mask(databaseUrl)}`);
  }

  const db = await createStore({ databaseUrl, dataDir: process.env.DATA_DIR });
  const archive = new ConversationArchive(db);
  const intelligence = new CopilotKitIntelligence({ apiKey });

  try {
    const owners = await db.allOwners();
    console.log(`[归档回填] 待处理用户 ${owners.length} 个`);

    let threads = 0;
    let scanned = 0;
    let written = 0;
    for (const owner of owners) {
      let cursor: string | undefined;
      do {
        let page: Awaited<ReturnType<CopilotKitIntelligence["listThreads"]>>;
        try {
          page = await intelligence.listThreads({
            userId: owner,
            // 本应用的 runtime 只注册了 `default` 这一个 agent（见 agent.ts）。
            agentId: "default",
            // 归档也要，历史没有「已归档就不用保存」的说法。
            includeArchived: true,
            limit: PAGE_SIZE,
            ...(cursor ? { cursor } : {}),
          });
        } catch (error) {
          // 单个用户读取失败不该中断整次回填，记下来继续下一个。
          console.error(
            `[归档回填] 读取用户 ${owner} 的线程列表失败：`,
            error instanceof Error ? error.message : error,
          );
          break;
        }

        for (const thread of page.threads) {
          threads += 1;
          let history: Awaited<ReturnType<CopilotKitIntelligence["getThreadMessages"]>>;
          try {
            history = await intelligence.getThreadMessages({ threadId: thread.id, userId: owner });
          } catch (error) {
            console.error(
              `[归档回填] 读取线程 ${thread.id} 的消息失败：`,
              error instanceof Error ? error.message : error,
            );
            continue;
          }
          for (const message of history.messages) {
            scanned += 1;
            if (await archive.backfill(owner, thread.id, message)) written += 1;
          }
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
    }

    console.log(
      `[归档回填] 完成：扫描 ${threads} 个线程 / ${scanned} 条消息，写入（覆盖）归档 ${written} 条。`,
    );
  } finally {
    await db.close();
  }
}

await main();
