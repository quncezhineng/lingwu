import assert from "node:assert/strict";
import test from "node:test";
import {
  goBack,
  navigateTo,
  normalizeSection,
  ROOT_NAVIGATION,
  SECTION_STACK_LIMIT,
  sectionLevel,
} from "../src/navigation.ts";

test("返回回到进入当前页之前的页面", () => {
  const chat = ROOT_NAVIGATION;
  const files = navigateTo(chat, "files");
  assert.deepEqual(files, { section: "files", stack: ["chat"] });

  const settings = navigateTo(files, "settings");
  assert.deepEqual(settings, { section: "settings", stack: ["chat", "files"] });

  assert.deepEqual(goBack(settings), files);
  assert.deepEqual(goBack(goBack(settings)), chat);
});

test("对话页是根页面，继续返回不会离开它", () => {
  assert.deepEqual(goBack(ROOT_NAVIGATION), ROOT_NAVIGATION);
  // 没有历史时（理论上不会出现的直接进入），退回对话页。
  assert.deepEqual(goBack({ section: "watchlist", stack: [] }), ROOT_NAVIGATION);
});

test("同一页内的页签切换不产生新的层级", () => {
  const chat = ROOT_NAVIGATION;
  const watchlist = navigateTo(chat, "watchlist");
  const portfolio = navigateTo(watchlist, "portfolio");
  assert.deepEqual(portfolio, { section: "portfolio", stack: ["chat"] });
  assert.deepEqual(goBack(portfolio), chat);

  const notes = navigateTo(navigateTo(chat, "files"), "notes");
  assert.deepEqual(notes, { section: "notes", stack: ["chat"] });
  assert.equal(sectionLevel("portfolio"), sectionLevel("watchlist"));
  assert.equal(sectionLevel("notes"), sectionLevel("files"));
});

test("重复进入当前页不会压栈，历史遗留别名归一为同一页", () => {
  const files = navigateTo(ROOT_NAVIGATION, "files");
  assert.equal(navigateTo(files, "files"), files);
  assert.deepEqual(navigateTo(ROOT_NAVIGATION, "connections"), navigateTo(ROOT_NAVIGATION, "apps"));
  assert.equal(normalizeSection("connections"), "apps");
});

test("层级栈不会无限增长", () => {
  let state = ROOT_NAVIGATION;
  for (let index = 0; index < SECTION_STACK_LIMIT * 3; index += 1) {
    state = navigateTo(state, index % 2 === 0 ? "files" : "settings");
  }
  assert.equal(state.stack.length, SECTION_STACK_LIMIT);
  assert.equal(goBack(state).section, state.stack[state.stack.length - 1]);
});
