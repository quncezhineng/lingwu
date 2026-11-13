import type { TranslationKey } from "../en";
import agent from "./agent";
import app from "./app";
import chat from "./chat";
import common from "./common";
import computer from "./computer";
import deliverables from "./deliverables";
import details from "./details";
import financials from "./financials";
import markets from "./markets";
import monitor from "./monitor";
import notes from "./notes";
import portfolio from "./portfolio";
import quotes from "./quotes";
import research from "./research";
import screens from "./screens";
import search from "./search";
import status from "./status";
import templates from "./templates";
import threads from "./threads";
import tools from "./tools";
import ui from "./ui";

/**
 * 简体中文语言包。
 * `satisfies Record<TranslationKey, string>` 保证不会遗漏任何英文 key；
 * 专有名词 LingWu 统一译为「灵悟」。
 */
export const zhHans = {
  ...common,
  ...app,
  ...ui,
  ...chat,
  ...agent,
  ...screens,
  ...status,
  ...details,
  ...markets,
  ...monitor,
  ...research,
  ...search,
  ...portfolio,
  ...notes,
  ...quotes,
  ...financials,
  ...computer,
  ...deliverables,
  ...templates,
  ...threads,
  ...tools,
} satisfies Record<TranslationKey, string>;

export default zhHans;
