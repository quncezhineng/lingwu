import { execFile } from "node:child_process";
import { backgroundFailure } from "./log.ts";

export type PdfStatus = "available" | "unavailable";
export type PdfReason = "binary_missing" | "timeout" | "error";

export interface PdfHealth {
  status: PdfStatus;
  version?: string;
  reason?: PdfReason;
  detail?: string;
  checked_at?: string;
}

export type PdfProbeRunner = (timeoutMs: number) => Promise<{ stdout: string; stderr: string }>;

const DEFAULT_TTL_MS = 300_000;
const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_DETAIL_LENGTH = 160;

function sanitize(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL_LENGTH);
}

const defaultRunner: PdfProbeRunner = (timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(
      process.env.PDFTOTEXT_BIN ?? "pdftotext",
      ["-v"],
      { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 256 * 1024, env: process.env },
      (error, stdout, stderr) => {
        if (error) {
          const failure = error as NodeJS.ErrnoException & { killed?: boolean };
          const wrapped = new Error(stderr || error.message) as Error & {
            code?: string;
            killed?: boolean;
          };
          wrapped.code = failure.code;
          wrapped.killed = failure.killed;
          reject(wrapped);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });

/** Map a helper failure to a stable reason so operators can alert on one field. */
export function classifyPdfFailure(error: unknown): { reason: PdfReason; detail?: string } {
  const failure = (error ?? {}) as { code?: unknown; killed?: unknown; message?: unknown };
  const message = typeof failure.message === "string" ? failure.message : "";
  if (failure.code === "ENOENT")
    return { reason: "binary_missing", detail: "pdftotext was not found on PATH" };
  if (failure.killed === true || failure.code === "ETIMEDOUT")
    return { reason: "timeout", detail: "pdftotext probe timed out" };
  return { reason: "error", detail: sanitize(message || "pdftotext probe failed") };
}

/** `pdftotext -v` prints the version to stderr, e.g. "pdftotext version 24.02.0". */
export function parsePdfVersion(stdout: string, stderr: string): string | undefined {
  const text = `${stdout}\n${stderr}`;
  const match =
    /pdftotext version\s+([\w.\-+]+)/i.exec(text) ?? /version\s+([\w.\-+]+)/i.exec(text);
  return match?.[1];
}

export interface PdfHealthMonitor {
  /** Cached snapshot; never blocks, kicks a background probe when stale. */
  snapshot(): PdfHealth;
  refresh(force?: boolean): Promise<PdfHealth>;
}

export interface PdfHealthOptions {
  runner?: PdfProbeRunner;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
  log?: (entry: Record<string, unknown>) => void;
}

export function createPdfHealth(options: PdfHealthOptions = {}): PdfHealthMonitor {
  const runner = options.runner ?? defaultRunner;
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? (Number(process.env.PDF_HEALTH_TTL_MS) || DEFAULT_TTL_MS);
  const timeoutMs =
    options.timeoutMs ?? (Number(process.env.PDF_HEALTH_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));

  let cached: PdfHealth = { status: "unavailable", reason: "error", detail: "probe pending" };
  let checked = false;
  let checkedAt = 0;
  let inFlight: Promise<PdfHealth> | null = null;
  const timestamp = () => new Date(now()).toISOString();

  async function probe(): Promise<PdfHealth> {
    try {
      const { stdout, stderr } = await runner(timeoutMs);
      const version = parsePdfVersion(stdout, stderr);
      const result: PdfHealth = {
        status: "available",
        ...(version ? { version } : {}),
        checked_at: timestamp(),
      };
      log({
        timestamp: timestamp(),
        context: { phase: "pdf-self-check" },
        pdf: { status: result.status },
      });
      return result;
    } catch (error) {
      const classified = classifyPdfFailure(error);
      const result: PdfHealth = { status: "unavailable", ...classified, checked_at: timestamp() };
      // Financial PDF parsing fails with an explicit 422 when this is unavailable.
      log({
        timestamp: timestamp(),
        context: { phase: "pdf-self-check" },
        pdf: { status: result.status, reason: classified.reason },
      });
      return result;
    }
  }

  function refresh(force = false): Promise<PdfHealth> {
    if (inFlight) return inFlight;
    if (!force && checked && now() - checkedAt < ttlMs) return Promise.resolve(cached);
    inFlight = probe()
      .then((result) => {
        cached = result;
        checked = true;
        checkedAt = now();
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return {
    snapshot() {
      if (!checked || now() - checkedAt >= ttlMs)
        void refresh().catch((error) => backgroundFailure("pdf health probe", error));
      return { ...cached };
    },
    refresh,
  };
}

let singleton: PdfHealthMonitor | undefined;

/** Process-wide probe shared by the health route and the startup self-check. */
export function getPdfHealth(): PdfHealthMonitor {
  singleton ??= createPdfHealth();
  return singleton;
}
