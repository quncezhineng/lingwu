import { createContext, useContext } from "react";
import type {
  ActionProposal,
  Artifact,
  BrowserSession,
  CalendarEvent,
  EmailDraft,
  EventDraft,
  Mail,
  Section,
  Workspace,
} from "../../../packages/domain/src";
import type { AgentArtifact, AgentTask } from "../../../packages/domain/src/agent";
import type { LingWuApi } from "./api";
import type { Quote, SymbolMeta } from "./market";
export type Detail =
  | { type: "mail"; mail: Mail }
  | { type: "email"; draft?: Partial<EmailDraft> & { id?: string } }
  | { type: "event"; event?: CalendarEvent; draft?: EventDraft; neighbors?: CalendarEvent[] }
  | { type: "file"; file: Artifact }
  | { type: "artifact"; artifact: AgentArtifact }
  | { type: "insight"; artifact: AgentArtifact }
  | {
      type: "symbol";
      symbol: SymbolMeta;
      quote?: Quote;
      watchlist?: { id: string; name: string };
      focus?: "alerts";
    }
  | {
      type: "watchlist-symbol";
      symbol: SymbolMeta;
      quote?: Quote;
      watchlist: { id: string; name: string };
    }
  | { type: "browser"; browser: BrowserSession }
  | { type: "review"; action: ActionProposal }
  | { type: "task"; taskId: string }
  | { type: "goal"; goalId: string }
  | { type: "delegate"; goalId?: string; milestoneId?: string; kind?: AgentTask["kind"] }
  | { type: "notifications" }
  | { type: "computer" }
  | { type: "archived" }
  | { type: "model-settings" }
  | { type: "menu" };

export interface PriceReminderIntent {
  id: number;
  kind: "price";
  symbol: SymbolMeta;
  quote?: Quote;
}

/** 从其他页面送进对话输入框的意图：draft 为真时只预填、由用户确认后再发送。 */
export interface ComposerPrompt {
  id: number;
  text: string;
  attachmentIds?: readonly string[];
  /** 预选进输入区的技能（技能目录 id），以 chip 形式展示，等用户确认后再发送。 */
  skillIds?: readonly string[];
  draft?: boolean;
}

export interface WorkspaceContextValue {
  workspace: Workspace;
  api: LingWuApi;
  section: Section;
  reminderIntent?: PriceReminderIntent;
  navigate: (section: Section) => void;
  /** 返回上一级页面；没有上级时回到对话页。 */
  back: () => void;
  refresh: () => Promise<void>;
  open: (detail: Detail) => void;
  close: () => void;
  requestPriceReminder: (symbol: SymbolMeta, quote?: Quote) => void;
  clearReminderIntent: () => void;
  notify: (message: string, action?: { label: string; onPress: () => void }) => void;
  ask: (prompt: string, attachmentIds?: readonly string[]) => void;
  /** 只把内容、附件与技能预选填进输入框、不自动发送，由用户确认后再发送。 */
  prefillPrompt: (
    text: string,
    attachmentIds?: readonly string[],
    skillIds?: readonly string[],
  ) => void;
}
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace is unavailable");
  return context;
}
