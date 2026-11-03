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
import {
  AGENT_SPACE_STORAGE_KEY,
  type AgentAvatarId,
  type AgentDefinition,
  type AgentSkill,
  type AgentSpaceState,
  type AgentTemplateId,
  type AgentUserPreferences,
  createAgentFromTemplate,
  createCustomSkill,
  normalizeAgentSpace,
  type SelectionLike,
  SYSTEM_AGENT_ID,
} from "./agent-space-model";
import { readStorage, writeStorage } from "./i18n/storage";
import { useLingWuThread } from "./threads";
import { useWorkspace } from "./workspace";

type CreateAgentInput = {
  template: Exclude<AgentTemplateId, "general">;
  name: string;
  role: string;
  persona: string;
  avatar: AgentAvatarId;
};

type AgentSpaceContextValue = {
  state: AgentSpaceState;
  current: AgentDefinition;
  agents: AgentDefinition[];
  selection: SelectionLike;
  preferences: AgentUserPreferences;
  loading: boolean;
  needsOnboarding: boolean;
  selectAgent: (id: string) => void;
  createAgent: (input: CreateAgentInput) => AgentDefinition;
  updateAgent: (id: string, patch: Partial<AgentDefinition>) => void;
  deleteAgent: (id: string) => void;
  markThreadUsed: (id: string) => void;
  setPreferences: (patch: Partial<AgentUserPreferences>) => void;
  advanceOnboarding: (step: number) => void;
  completeOnboarding: () => void;
  finishOnboarding: (preferences: Partial<AgentUserPreferences>) => void;
  replayOnboarding: () => void;
  saveSkill: (
    agentId: string,
    input: Pick<AgentSkill, "name" | "purpose" | "instructions" | "outputFormat">,
    skillId?: string,
  ) => void;
  toggleSkill: (agentId: string, skillId: string) => void;
};

const AgentSpaceContext = createContext<AgentSpaceContextValue | null>(null);

function loadState(mainThreadId: string) {
  const raw = readStorage(AGENT_SPACE_STORAGE_KEY);
  if (!raw) return normalizeAgentSpace(undefined, mainThreadId);
  try {
    return normalizeAgentSpace(JSON.parse(raw), mainThreadId);
  } catch {
    return normalizeAgentSpace(undefined, mainThreadId);
  }
}

export function AgentSpaceProvider({ children }: { children: ReactNode }) {
  const { api } = useWorkspace();
  const { mainId } = useLingWuThread();
  const [state, setState] = useState<AgentSpaceState>(() => loadState(mainId));
  const [remoteReady, setRemoteReady] = useState(false);
  const remoteRequest = useRef(0);

  // The server is the source of truth for the default thread id. Existing local
  // Agent data is normalized rather than discarded when that id becomes available.
  useEffect(() => {
    setState((value) => normalizeAgentSpace(value, mainId));
  }, [mainId]);

  useEffect(() => {
    writeStorage(AGENT_SPACE_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Prefer the account's server copy so changing from mobile to web keeps the
  // same Agents. Local state remains the offline/fallback copy.
  useEffect(() => {
    const request = ++remoteRequest.current;
    void api
      .request<AgentSpaceState | null>("/api/agent-space")
      .then((remote) => {
        if (request !== remoteRequest.current) return;
        if (remote) setState(normalizeAgentSpace(remote, mainId));
      })
      .catch(() => {
        // A missing network must not block the local Agent workspace.
      })
      .finally(() => {
        if (request === remoteRequest.current) setRemoteReady(true);
      });
  }, [api, mainId]);

  useEffect(() => {
    if (!remoteReady) return;
    const timer = setTimeout(() => {
      void api.request("/api/agent-space", state, "PUT").catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [api, remoteReady, state]);

  const current = useMemo(
    () =>
      state.agents.find(
        (agent) => agent.id === (state.onboardingDone ? state.currentAgentId : SYSTEM_AGENT_ID),
      ) ?? state.agents[0],
    [state.agents, state.currentAgentId, state.onboardingDone],
  );

  const selectAgent = useCallback((id: string) => {
    setState((value) =>
      value.agents.some((agent) => agent.id === id) ? { ...value, currentAgentId: id } : value,
    );
  }, []);

  const createAgent = useCallback((input: CreateAgentInput) => {
    const agent = createAgentFromTemplate(input.template, input);
    setState((value) => ({
      ...value,
      currentAgentId: agent.id,
      agents: [...value.agents, agent],
    }));
    return agent;
  }, []);

  const updateAgent = useCallback((id: string, patch: Partial<AgentDefinition>) => {
    setState((value) => ({
      ...value,
      agents: value.agents.map((agent) =>
        agent.id === id
          ? {
              ...agent,
              ...patch,
              id: agent.id,
              threadId: agent.threadId,
              system: agent.system,
              name: (patch.name ?? agent.name).trim().slice(0, 20) || agent.name,
              role: (patch.role ?? agent.role).trim().slice(0, 30) || agent.role,
              persona: (patch.persona ?? agent.persona).trim().slice(0, 1000) || agent.persona,
            }
          : agent,
      ),
    }));
  }, []);

  const deleteAgent = useCallback((id: string) => {
    if (id === SYSTEM_AGENT_ID) return;
    setState((value) => {
      const agents = value.agents.filter((agent) => agent.id !== id);
      return {
        ...value,
        agents,
        currentAgentId:
          value.currentAgentId === id ? (agents[0]?.id ?? SYSTEM_AGENT_ID) : value.currentAgentId,
      };
    });
  }, []);

  const markThreadUsed = useCallback((id: string) => {
    setState((value) => ({
      ...value,
      agents: value.agents.map((agent) =>
        agent.id === id && !agent.threadExists ? { ...agent, threadExists: true } : agent,
      ),
    }));
  }, []);

  const setPreferences = useCallback((patch: Partial<AgentUserPreferences>) => {
    setState((value) => ({
      ...value,
      preferences: { ...value.preferences, ...patch },
    }));
  }, []);

  const advanceOnboarding = useCallback((step: number) => {
    setState((value) => ({
      ...value,
      onboardingStep: Math.max(0, Math.min(4, Math.trunc(step))),
    }));
  }, []);

  const completeOnboarding = useCallback(() => {
    setState((value) => ({ ...value, onboardingDone: true, onboardingStep: 4 }));
  }, []);

  const finishOnboarding = useCallback((preferences: Partial<AgentUserPreferences>) => {
    setState((value) => ({
      ...value,
      preferences: { ...value.preferences, ...preferences },
      onboardingDone: true,
      onboardingStep: 4,
    }));
  }, []);

  const replayOnboarding = useCallback(() => {
    setState((value) => ({ ...value, onboardingDone: false, onboardingStep: 0 }));
  }, []);

  const saveSkill = useCallback<AgentSpaceContextValue["saveSkill"]>((agentId, input, skillId) => {
    setState((value) => {
      const target = value.agents.find((agent) => agent.id === agentId);
      const existing = target?.customSkills.find((skill) => skill.id === skillId);
      const skill = createCustomSkill(input, existing);
      return {
        ...value,
        agents: value.agents.map((agent) => {
          if (agent.id !== agentId) return agent;
          return {
            ...agent,
            customSkills: existing
              ? agent.customSkills.map((candidate) =>
                  candidate.id === existing.id ? skill : candidate,
                )
              : [...agent.customSkills, skill],
          };
        }),
      };
    });
  }, []);

  const toggleSkill = useCallback((agentId: string, skillId: string) => {
    setState((value) => ({
      ...value,
      agents: value.agents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              customSkills: agent.customSkills.map((skill) =>
                skill.id === skillId
                  ? {
                      ...skill,
                      enabled: !skill.enabled,
                      version: skill.version + 1,
                      updatedAt: new Date().toISOString(),
                    }
                  : skill,
              ),
            }
          : agent,
      ),
    }));
  }, []);

  const selection = useMemo<SelectionLike>(
    () => ({
      id: current.threadId || mainId,
      existing: current.system || current.threadExists,
    }),
    [current, mainId],
  );

  const value = useMemo<AgentSpaceContextValue>(
    () => ({
      state,
      current,
      agents: state.agents,
      selection,
      preferences: state.preferences,
      loading: !remoteReady,
      needsOnboarding: !state.onboardingDone,
      selectAgent,
      createAgent,
      updateAgent,
      deleteAgent,
      markThreadUsed,
      setPreferences,
      advanceOnboarding,
      completeOnboarding,
      finishOnboarding,
      replayOnboarding,
      saveSkill,
      toggleSkill,
    }),
    [
      state,
      current,
      selection,
      remoteReady,
      selectAgent,
      createAgent,
      updateAgent,
      deleteAgent,
      markThreadUsed,
      setPreferences,
      advanceOnboarding,
      completeOnboarding,
      finishOnboarding,
      replayOnboarding,
      saveSkill,
      toggleSkill,
    ],
  );

  return <AgentSpaceContext.Provider value={value}>{children}</AgentSpaceContext.Provider>;
}

export function useAgentSpace() {
  const context = useContext(AgentSpaceContext);
  if (!context) throw new Error("Agent space is unavailable");
  return context;
}
