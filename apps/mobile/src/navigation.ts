import type { Section } from "../../../packages/domain/src";

/**
 * 页面层级导航。
 *
 * App 不使用路由库，页面只是一个 Section 状态；为了让页面顶部的「返回」能回到
 * 上一级页面，这里维护一份进入当前页之前经过的页面栈：
 * `stack` 的栈顶就是当前页的上一级页面，对话页（chat）是根页面。
 */
export interface SectionNavigation {
  /** 当前页面。 */
  section: Section;
  /** 进入当前页之前依次经过的页面，栈顶为上一级页面。 */
  stack: Section[];
}

/** 根页面：对话页，没有上一级。 */
export const ROOT_NAVIGATION: SectionNavigation = { section: "chat", stack: [] };

/**
 * 同一页面内的页签切换不构成新的层级：
 * 自选/组合、资料/笔记、任务/目标共用一层，避免「返回」在页签之间来回跳。
 */
const SECTION_LEVEL: Partial<Record<Section, string>> = {
  watchlist: "markets",
  portfolio: "markets",
  files: "library",
  notes: "library",
  deliverables: "library",
  templates: "library",
  activity: "tasks",
  goals: "tasks",
};

/** 页面层级最多保留 20 层，避免长时间使用后无限增长。 */
export const SECTION_STACK_LIMIT = 20;

/** 历史遗留别名：connections 与 apps 是同一页。 */
export function normalizeSection(section: Section): Section {
  return section === "connections" ? "apps" : section;
}

/** 页签所在层级：同层页面之间切换只替换当前页。 */
export function sectionLevel(section: Section): string {
  return SECTION_LEVEL[section] ?? section;
}

/** 进入下一级页面：把当前页压栈，作为返回时的目标。 */
export function navigateTo(state: SectionNavigation, next: Section): SectionNavigation {
  const target = normalizeSection(next);
  if (state.section === target) return state;
  // 页签切换只替换当前页，不产生新的层级。
  if (sectionLevel(state.section) === sectionLevel(target)) return { ...state, section: target };
  return {
    section: target,
    stack: [...state.stack, state.section].slice(-SECTION_STACK_LIMIT),
  };
}

/** 返回上一级页面：回栈顶；没有上级时回到根页面（对话页）。 */
export function goBack(state: SectionNavigation): SectionNavigation {
  const parent = state.stack[state.stack.length - 1];
  if (!parent) return state.section === "chat" ? state : ROOT_NAVIGATION;
  return { section: parent, stack: state.stack.slice(0, -1) };
}
