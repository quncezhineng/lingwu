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
  type AgentSpaceRemoteLoad,
  type AgentSpaceState,
  type AgentTemplateId,
  type AgentUserPreferences,
  agentSpaceCanPersist,
  agentSpaceRemoteSettled,
  agentSpaceStorageKey,
  createAgentFromTemplate,
  createCustomSkill,
  DEFAULT_PREFERENCES,
  detachSkillFromAgent,
  normalizeAgentSpace,
  resolveRemoteAgentSpace,
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
  /** 置顶 / 取消置顶：只影响列表展示顺序，不改动 agents 的存储顺序。 */
  setAgentPinned: (id: string, pinned: boolean) => void;
  markThreadUsed: (id: string) => void;
  setPreferences: (patch: Partial<AgentUserPreferences>) => void;
  resetPreferences: () => void;
  advanceOnboarding: (step: number) => void;
  completeOnboarding: () => void;
  finishOnboarding: (preferences: Partial<AgentUserPreferences>) => void;
  replayOnboarding: () => void;
  saveSkill: (
    agentId: string,
    input: Pick<AgentSkill, "name" | "purpose" | "instructions" | "outputFormat">,
    skillId?: string,
  ) => void;
  /** 账户级技能库：创建技能只写入这里，不会自动挂到任何 Agent。 */
  skillLibrary: AgentSkill[];
  /** 新建 / 编辑技能库里的技能（skillId 为空表示新建）。 */
  saveLibrarySkill: (
    input: Pick<AgentSkill, "name" | "purpose" | "instructions" | "outputFormat">,
    skillId?: string,
  ) => void;
  /** 删除技能库里的技能；Agent 上的副本由调用方用 deleteSkillEverywhere 清理。 */
  deleteLibrarySkill: (skillId: string) => void;
  toggleSkill: (agentId: string, skillId: string) => void;
  /** 删除某个 Agent 上的自建技能副本；账户级技能库里的原件不受影响。 */
  deleteSkill: (agentId: string, skillId: string) => void;
  /** 从技能目录安装 / 卸载某个技能到指定 Agent；已安装时不重复写入。 */
  setSkillInstalled: (agentId: string, skillId: string, installed: boolean) => void;
};

const AgentSpaceContext = createContext<AgentSpaceContextValue | null>(null);

function loadState(storageKey: string, mainThreadId: string) {
  const raw = readStorage(storageKey);
  if (!raw) return normalizeAgentSpace(undefined, mainThreadId);
  try {
    return normalizeAgentSpace(JSON.parse(raw), mainThreadId);
  } catch {
    return normalizeAgentSpace(undefined, mainThreadId);
  }
}

export function AgentSpaceProvider({
  children,
  accountScope,
}: {
  children: ReactNode;
  /** Stable authenticated-session identity; unlike profile data it cannot lag behind login. */
  accountScope?: string;
}) {
  const { api, workspace } = useWorkspace();
  const { mainId } = useLingWuThread();
  const storageKey =
    agentSpaceStorageKey(accountScope ?? workspace.profile.email) ??
    `${AGENT_SPACE_STORAGE_KEY}.anonymous`;
  const [state, setState] = useState<AgentSpaceState>(() => loadState(storageKey, mainId));
  const [stateStorageKey, setStateStorageKey] = useState(storageKey);
  const [remoteLoad, setRemoteLoad] = useState<AgentSpaceRemoteLoad>();
  const remoteRequest = useRef(0);
  const previousStorageKey = useRef(storageKey);

  // The server is the source of truth for the default thread id. Existing local
  // Agent data is normalized rather than discarded when that id becomes available.
  useEffect(() => {
    setState((value) => normalizeAgentSpace(value, mainId));
  }, [mainId]);

  useEffect(() => {
    if (previousStorageKey.current === storageKey) return;
    previousStorageKey.current = storageKey;
    setStateStorageKey(storageKey);
    setState(loadState(storageKey, mainId));
  }, [mainId, storageKey]);

  useEffect(() => {
    // A key change starts a new render before the effect above installs the new
    // cache. Never write the previous account's in-memory state to the new key.
    if (stateStorageKey !== storageKey) return;
    writeStorage(storageKey, JSON.stringify(state));
  }, [state, stateStorageKey, storageKey]);

  // Prefer the account's server copy so changing from mobile to web keeps the
  // same Agents. Writes stay disabled until this exact request succeeds, so a
  // slow or failed new-account load cannot upload stale cached Agents.
  useEffect(() => {
    const request = ++remoteRequest.current;
    setRemoteLoad(undefined);
    void api
      .request<AgentSpaceState | null>("/api/agent-space")
      .then((remote) => {
        if (request !== remoteRequest.current) return;
        // A successful null is authoritative for a first-time account. Do not
        // import a stale local cache from another account into a new workspace.
        setState(resolveRemoteAgentSpace(remote, mainId));
        setRemoteLoad({ storageKey, request, writable: true });
      })
      .catch(() => {
        if (request !== remoteRequest.current) return;
        // Keep the local workspace usable offline, but never PUT over a server
        // state that has not been read successfully.
        setRemoteLoad({ storageKey, request, writable: false });
      });
  }, [api, mainId, storageKey]);

  useEffect(() => {
    if (!agentSpaceCanPersist(remoteLoad, storageKey, remoteRequest.current)) return;
    const timer = setTimeout(() => {
      void api.request("/api/agent-space", state, "PUT").catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [api, remoteLoad, state, storageKey]);

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
      agents: value.agents.map((agent) => {
        if (agent.id !== id) return agent;
        const next: AgentDefinition = {
          ...agent,
          ...patch,
          id: agent.id,
          threadId: agent.threadId,
          system: agent.system,
          name: (patch.name ?? agent.name).trim().slice(0, 20) || agent.name,
          role: (patch.role ?? agent.role).trim().slice(0, 30) || agent.role,
          persona: (patch.persona ?? agent.persona).trim().slice(0, 1000) || agent.persona,
        };
        // 没有专属模型时不写字段：留空代表跟随工作区默认模型，服务端 schema 也不接受空字符串。
        if (!next.model?.trim()) delete next.model;
        return next;
      }),
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

  const setAgentPinned = useCallback((id: string, pinned: boolean) => {
    setState((value) => {
      const target = value.agents.find((agent) => agent.id === id);
      if (!target || target.system === true) return value;
      if (!!target.pinned === pinned) return value;
      return {
        ...value,
        agents: value.agents.map((agent) => {
          if (agent.id !== id) return agent;
          // 取消置顶时删掉字段，与归一化后的持久化形态保持一致。
          const next = { ...agent };
          if (pinned) next.pinned = true;
          else delete next.pinned;
          return next;
        }),
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

  const resetPreferences = useCallback(() => {
    setState((value) => ({ ...value, preferences: { ...DEFAULT_PREFERENCES } }));
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

  const saveLibrarySkill = useCallback<AgentSpaceContextValue["saveLibrarySkill"]>(
    (input, skillId) => {
      setState((value) => {
        const existing = value.skillLibrary.find((skill) => skill.id === skillId);
        const skill = createCustomSkill(input, existing);
        return {
          ...value,
          skillLibrary: existing
            ? value.skillLibrary.map((candidate) =>
                candidate.id === existing.id ? skill : candidate,
              )
            : [...value.skillLibrary, skill],
        };
      });
    },
    [],
  );

  const deleteLibrarySkill = useCallback<AgentSpaceContextValue["deleteLibrarySkill"]>(
    (skillId) => {
      setState((value) => ({
        ...value,
        skillLibrary: value.skillLibrary.filter((skill) => skill.id !== skillId),
      }));
    },
    [],
  );

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

  // 只摘掉该 Agent 的副本：账户级技能库（「我的技能」）的原件一字不动。
  const deleteSkill = useCallback<AgentSpaceContextValue["deleteSkill"]>((agentId, skillId) => {
    setState((value) => detachSkillFromAgent(value, agentId, skillId));
  }, []);

  const setSkillInstalled = useCallback<AgentSpaceContextValue["setSkillInstalled"]>(
    (agentId, skillId, installed) => {
      const id = skillId.trim();
      if (!id) return;
      setState((value) => {
        const target = value.agents.find((agent) => agent.id === agentId);
        if (!target || target.installedSkills.includes(id) === installed) return value;
        return {
          ...value,
          agents: value.agents.map((agent) => {
            if (agent.id !== agentId) return agent;
            const next = installed
              ? [...agent.installedSkills, id]
              : agent.installedSkills.filter((candidate) => candidate !== id);
            return { ...agent, installedSkills: next };
          }),
        };
      });
    },
    [],
  );

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
      loading: !agentSpaceRemoteSettled(remoteLoad, storageKey, remoteRequest.current),
      needsOnboarding: !state.onboardingDone,
      selectAgent,
      createAgent,
      updateAgent,
      deleteAgent,
      setAgentPinned,
      markThreadUsed,
      setPreferences,
      resetPreferences,
      advanceOnboarding,
      completeOnboarding,
      finishOnboarding,
      replayOnboarding,
      saveSkill,
      skillLibrary: state.skillLibrary,
      saveLibrarySkill,
      deleteLibrarySkill,
      toggleSkill,
      deleteSkill,
      setSkillInstalled,
    }),
    [
      state,
      current,
      selection,
      remoteLoad,
      selectAgent,
      createAgent,
      updateAgent,
      deleteAgent,
      setAgentPinned,
      markThreadUsed,
      setPreferences,
      resetPreferences,
      advanceOnboarding,
      completeOnboarding,
      finishOnboarding,
      replayOnboarding,
      saveSkill,
      saveLibrarySkill,
      deleteLibrarySkill,
      toggleSkill,
      deleteSkill,
      setSkillInstalled,
    ],
  );

  return <AgentSpaceContext.Provider value={value}>{children}</AgentSpaceContext.Provider>;
}

export function useAgentSpace() {
  const context = useContext(AgentSpaceContext);
  if (!context) throw new Error("Agent space is unavailable");
  return context;
}
