/**
 * 把任意抛出物整理成一行可读文本。
 *
 * PGlite / WASM 层抛的不一定是 Error（有时是普通对象），直接 String() 会得到
 * `[object Object]`，部署日志里等于没有信息；这里把常见形态都收敛成文本。
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    const json = JSON.stringify(error);
    if (json && json !== "{}" && json !== "undefined") return json.slice(0, 300);
  } catch {
    /* 循环引用等无法序列化，退回 String() */
  }
  return String(error);
}

/** Background errors are visible without logging provider payloads or credential-bearing URLs. */
export function backgroundFailure(phase: string, error: unknown) {
  const rawCode =
    error instanceof Error && "code" in error
      ? (error as Error & { code?: unknown }).code
      : undefined;
  const code =
    typeof rawCode === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(rawCode) ? rawCode : undefined;
  console.error({
    timestamp: new Date().toISOString(),
    context: { phase },
    error: error instanceof Error ? error.name : "Background operation failed",
    ...(code ? { code } : {}),
  });
}

/** Provider failures keep status and request ID for support, never bodies or credentials. */
export function providerFailure(phase: string, error: unknown) {
  const detail = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  console.error({
    timestamp: new Date().toISOString(),
    context: {
      phase,
      ...(typeof detail.status === "number" ? { status: detail.status } : {}),
      ...(typeof detail.requestId === "string" ? { requestId: detail.requestId } : {}),
    },
    error: error instanceof Error ? error.name : "Provider request failed",
  });
}

/**
 * 过滤掉 Rich Threads SDK 对「线程读不到」的重复报错。
 *
 * 云端 SDK 每次请求失败都会自己打一条 `... Intelligence platform request failed`，
 * 而「线程没建过（404）/ 线程 id 非法（400，客户端占位 id `local`）」是我们已经按
 * 空历史处理的正常情况（见 app.ts 的 isMissingCloudThread）。不做这层过滤的话，
 * 每次打开首页/会话都会为每个还没聊过的 Agent 刷一条 error，把真正的报错淹没。
 *
 * 只拦 SDK 那一条固定文案 + 线程接口的 400/404，其它错误（含 401/403/5xx）原样透出。
 */
export function silenceMissingThreadLogs() {
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const [first, second] = args;
    if (
      second === "Intelligence platform request failed" &&
      first !== null &&
      typeof first === "object"
    ) {
      const { status, path } = first as { status?: unknown; path?: unknown };
      if (
        (status === 400 || status === 404) &&
        typeof path === "string" &&
        path.startsWith("/api/threads/")
      ) {
        return;
      }
    }
    original(...args);
  };
}
