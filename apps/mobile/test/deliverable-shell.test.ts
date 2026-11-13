/**
 * 挂载契约：真正的 AgentProductShell / Today / 侧栏 / 手机首页都必须挂上交付物页面。
 * 直接解析真实源码，避免「页面写好了但没人渲染」。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { navigateTo, ROOT_NAVIGATION } from "../src/navigation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const source = (name: string) => readFileSync(resolve(here, "../src", name), "utf8");

function parse(name: string) {
  return ts.createSourceFile(name, source(name), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function visit(node: ts.Node, fn: (node: ts.Node) => void) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

function namedFunction(file: ts.SourceFile, name: string) {
  let found: ts.FunctionDeclaration | undefined;
  visit(file, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
  });
  assert.ok(found, `${file.fileName} 应定义 ${name}`);
  return found;
}

function hasStringLiteral(node: ts.Node, value: string) {
  let found = false;
  visit(node, (child) => {
    if (ts.isStringLiteral(child) && child.text === value) found = true;
  });
  return found;
}

function hasIdentifier(node: ts.Node, value: string) {
  let found = false;
  visit(node, (child) => {
    if (ts.isIdentifier(child) && child.text === value) found = true;
  });
  return found;
}

function hasJsxTag(node: ts.Node, value: string) {
  let found = false;
  visit(node, (child) => {
    if (ts.isJsxSelfClosingElement(child) && child.tagName.getText() === value) found = true;
  });
  return found;
}

test("SecondarySection 实际渲染 DeliverablesScreen", () => {
  const file = parse("agent-product.tsx");
  const secondary = namedFunction(file, "SecondarySection");
  let caseClause: ts.CaseClause | undefined;
  visit(secondary, (node) => {
    if (
      ts.isCaseClause(node) &&
      ts.isStringLiteral(node.expression) &&
      node.expression.text === "deliverables"
    )
      caseClause = node;
  });
  assert.ok(caseClause, 'SecondarySection 必须包含 case "deliverables"');
  assert.equal(hasJsxTag(caseClause, "DeliverablesScreen"), true);
});

test("Today 挂载待审批交付物卡片", () => {
  const helper = parse("deliverable-today.tsx");
  assert.equal(hasStringLiteral(helper, "screens.deliverableTodayHeading"), true);
  const today = parse("screens.tsx");
  const screen = namedFunction(today, "TodayScreen");
  assert.equal(hasJsxTag(screen, "DeliverableTodayCard"), true);
});

test("桌面侧栏与手机首页都有交付物入口", () => {
  const shell = parse("agent-product.tsx");
  assert.equal(
    hasStringLiteral(namedFunction(shell, "AgentRail"), "agent-rail-deliverables"),
    true,
  );
  const home = parse("mobile-bots-home.tsx");
  const bots = namedFunction(home, "MobileBotsHome");
  assert.equal(hasStringLiteral(bots, "mobile-bots-deliverables"), true);
  assert.equal(hasIdentifier(bots, "onOpenDeliverables"), true);
});

test("交付物是独立层级，可从 Today 进入并返回", () => {
  const entered = navigateTo(ROOT_NAVIGATION, "deliverables");
  assert.equal(entered.section, "deliverables");
  assert.deepEqual(entered.stack, ["chat"]);
});
