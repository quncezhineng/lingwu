import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import type { ASTNode, RenderRules } from "react-native-markdown-renderer";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import { markdownTableRows, markdownTableWidths } from "./markdown-table-layout";
import { colors, fonts } from "./theme";

const TableLayout = createContext<{ widths: number[]; compact: boolean }>({
  widths: [],
  compact: false,
});

function MarkdownTable({
  node,
  compact,
  children,
}: {
  node: ASTNode;
  compact: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [viewport, setViewport] = useState(0);
  const rows = useMemo(() => markdownTableRows(node), [node]);
  const widths = useMemo(
    () => markdownTableWidths(rows, Math.max(0, viewport - 2), compact),
    [rows, viewport, compact],
  );
  const layout = useMemo(() => ({ widths, compact }), [widths, compact]);
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  const overflows = viewport > 0 && tableWidth > viewport;
  return (
    <View
      testID="markdown-table"
      onLayout={({ nativeEvent }) => setViewport(Math.floor(nativeEvent.layout.width))}
      style={{
        width: "100%",
        minWidth: 0,
        marginTop: compact ? 4 : 8,
        marginBottom: compact ? 6 : 14,
      }}
    >
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        bounces={false}
        showsHorizontalScrollIndicator={overflows}
        style={{
          width: "100%",
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 10,
          backgroundColor: colors.paper,
        }}
      >
        <TableLayout.Provider value={layout}>
          <View role="table" style={{ width: tableWidth }}>
            {children}
          </View>
        </TableLayout.Provider>
      </ScrollView>
      {overflows && (
        <Text style={{ fontSize: 11, lineHeight: 17, color: colors.faint, marginTop: 5 }}>
          {t("chat.tableScrollHint")}
        </Text>
      )}
    </View>
  );
}

function MarkdownCell({ node, children }: { node: ASTNode; children: ReactNode }) {
  const { widths, compact } = useContext(TableLayout);
  return (
    <View
      role={node.type === "th" ? "columnheader" : "cell"}
      style={{
        width: widths[node.index],
        flexShrink: 0,
        paddingHorizontal: compact ? 10 : 14,
        paddingVertical: compact ? 8 : 11,
        justifyContent: "flex-start",
      }}
    >
      {children}
    </View>
  );
}

export function markdownTableRules(compact: boolean): RenderRules {
  return {
    table: (node, children) => (
      <MarkdownTable key={node.key} node={node} compact={compact}>
        {children}
      </MarkdownTable>
    ),
    thead: (node, children) => (
      <View key={node.key} role="rowgroup" style={{ backgroundColor: colors.surface }}>
        {children}
      </View>
    ),
    tbody: (node, children) => (
      <View key={node.key} role="rowgroup">
        {children}
      </View>
    ),
    tr: (node, children, parents) => {
      const header = parents.some((parent) => parent.type === "thead");
      return (
        <View
          key={node.key}
          role="row"
          style={{
            flexDirection: "row",
            alignItems: "stretch",
            borderTopWidth: header ? 0 : 1,
            borderTopColor: colors.lineSoft,
            backgroundColor: header
              ? undefined
              : node.index % 2
                ? colors.surfaceRaised
                : colors.paper,
          }}
        >
          {children}
        </View>
      );
    },
    th: (node, children) => (
      <MarkdownCell key={node.key} node={node}>
        {children}
      </MarkdownCell>
    ),
    td: (node, children) => (
      <MarkdownCell key={node.key} node={node}>
        {children}
      </MarkdownCell>
    ),
  };
}

export function markdownCellTextStyle(cell: ASTNode, compact: boolean) {
  const alignment = cell.attributes.style?.match(/text-align\s*:\s*(left|center|right)/)?.[1];
  return {
    color: cell.type === "th" ? colors.heading : colors.text,
    fontFamily: fonts.sans,
    fontSize: compact ? 12 : 14,
    lineHeight: compact ? 19 : 23,
    fontWeight: cell.type === "th" ? ("600" as const) : ("400" as const),
    fontVariant: ["tabular-nums" as const],
    textAlign: (alignment ?? "left") as "left" | "center" | "right",
  };
}
