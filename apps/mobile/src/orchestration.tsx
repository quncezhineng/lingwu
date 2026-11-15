import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { OrchestrationPlan } from "../../../packages/domain/src/orchestration";
import { useWorkspace } from "./workspace";

/**
 * 多 Agent 编排进度数据层（M2）。
 *
 * 后端在对话内由编排者 Agent 调用 submit_orchestration 后，把 DAG 计划落盘到
 * orchestration_plans。本 hook 轮询 GET /api/orchestrations，供前端呈现
 * 「拆解 → 各专家并行执行 → 汇总」的实时进度。
 */
interface OrchestrationContextValue {
  /** 按创建时间倒序的编排计划。 */
  plans: OrchestrationPlan[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  /** 找到 parentTaskId 对应的最新编排计划。 */
  byParentTask: (parentTaskId: string) => OrchestrationPlan | undefined;
}

const OrchestrationContext = createContext<OrchestrationContextValue | null>(null);

const POLL_MS = 2000;

export function OrchestrationProvider({ children }: { children: ReactNode }) {
  const { api } = useWorkspace();
  const [plans, setPlans] = useState<OrchestrationPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await api.request<OrchestrationPlan[]>("/api/orchestrations");
      setPlans(list);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  // 首次加载 + 每 POLL_MS 轮询一次，跟踪进行中的编排直到终态。
  useEffect(() => {
    setLoading(true);
    void refresh();
    timer.current = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  const byParentTask = useCallback(
    (parentTaskId: string) =>
      plans.find((plan) => plan.parentTaskId === parentTaskId && plan.status === "running"),
    [plans],
  );

  const value = useMemo(
    () => ({ plans, loading, error, refresh, byParentTask }),
    [plans, loading, error, refresh, byParentTask],
  );

  return <OrchestrationContext.Provider value={value}>{children}</OrchestrationContext.Provider>;
}

export function useOrchestrations() {
  const context = useContext(OrchestrationContext);
  if (!context) throw new Error("Orchestration provider is unavailable");
  return context;
}
