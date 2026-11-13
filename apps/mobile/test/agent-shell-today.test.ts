/**
 * 挂载契约：真正的 AgentProductShell 必须把 TodayScreen 接到 today 二级页，
 * 并且在桌面侧栏和手机首页都留下可达入口。这里直接解析真实 shell 源码，
 * 避免再出现「TodayScreen 有定义、Shell 却没挂载」而 1000+ 测试全绿的情况。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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

test("AgentProductShell 的 today 二级页实际渲染 TodayScreen", () => {
  const file = parse("agent-product.tsx");
  let importedToday = false;
  visit(file, (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "./screens" &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings) &&
      node.importClause.namedBindings.elements.some((el) => el.name.text === "TodayScreen")
    )
      importedToday = true;
  });
  assert.equal(importedToday, true, "agent-product 必须从 ./screens 导入 TodayScreen");

  const secondary = namedFunction(file, "SecondarySection");
  let todayCase: ts.CaseClause | undefined;
  visit(secondary, (node) => {
    if (
      ts.isCaseClause(node) &&
      ts.isStringLiteral(node.expression) &&
      node.expression.text === "today"
    )
      todayCase = node;
  });
  assert.ok(todayCase, 'SecondarySection 必须包含 case "today"');
  let returnsToday: ts.ReturnStatement | undefined;
  visit(todayCase, (node) => {
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isJsxSelfClosingElement(node.expression) &&
      node.expression.tagName.getText(file) === "TodayScreen"
    )
      returnsToday = node;
  });
  assert.ok(returnsToday, 'case "today" 必须实际返回 <TodayScreen />');
});

test("桌面侧栏与手机首页都提供 today 入口", () => {
  const file = parse("agent-product.tsx");
  const rail = namedFunction(file, "AgentRail");
  assert.equal(hasStringLiteral(rail, "agent-rail-today"), true);
  assert.equal(hasStringLiteral(rail, "today"), true);

  const bots = parse("mobile-bots-home.tsx");
  const home = namedFunction(bots, "MobileBotsHome");
  assert.equal(hasStringLiteral(home, "mobile-bots-today"), true);
  assert.equal(hasIdentifier(home, "onOpenToday"), true);
});

test("TodayScreen 仍是 screens 模块导出的真实页面，而不是空壳", () => {
  const file = parse("screens.tsx");
  const today = namedFunction(file, "TodayScreen");
  assert.equal(
    today.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
    true,
  );
});
