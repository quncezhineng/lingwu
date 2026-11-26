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
