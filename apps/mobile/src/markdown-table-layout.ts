import type { ASTNode } from "react-native-markdown-renderer";

/** Display width in font-size units; CJK and emoji need more room than Latin glyphs. */
export function markdownTextWidth(text: string): number {
  return Math.max(
    0,
    ...text.split("\n").map((line) =>
      Array.from(line).reduce((width, char) => {
        if (/\p{Mark}|\u200d|\ufe0f/u.test(char)) return width;
        return width + (/\s/u.test(char) ? 0.34 : (char.codePointAt(0) ?? 0) > 255 ? 1 : 0.56);
      }, 0),
    ),
  );
}

export function markdownNodeText(node: ASTNode): string {
  if (node.type === "softbreak" || node.type === "hardbreak") return "\n";
  if (node.children.length) return node.children.map(markdownNodeText).join("");
  return node.type === "image" ? (node.attributes.alt ?? "") : node.content;
}

export function markdownTableRows(node: ASTNode): string[][] {
  if (node.type === "tr") return [node.children.map(markdownNodeText)];
  return node.children.flatMap(markdownTableRows);
}

/**
 * Keep short values and headers readable, reserve more space for prose, and overflow
 * horizontally when those readable widths cannot fit. Never squeeze every column equally.
 */
export function markdownTableWidths(
  rows: readonly (readonly string[])[],
  availableWidth: number,
  compact = false,
): number[] {
  const columns = Math.max(0, ...rows.map((row) => row.length));
  if (!columns) return [];
  const fontSize = compact ? 12 : 14;
  const padding = compact ? 20 : 28;
  const minimum = compact ? 72 : 88;
  const maximum = compact ? 240 : 300;
  const widths = Array.from({ length: columns }, (_, index) => {
    const contentWidth = Math.max(0, ...rows.map((row) => markdownTextWidth(row[index] ?? "")));
    return Math.min(maximum, Math.max(minimum, Math.ceil(contentWidth * fontSize + padding)));
  });
  const total = widths.reduce((sum, width) => sum + width, 0);
  const extra = Math.max(0, Math.floor(availableWidth) - total);
  if (!extra) return widths;
  // Fill a wide viewport while keeping the content-derived proportions.
  let assigned = 0;
  return widths.map((width, index) => {
    const addition = index === columns - 1 ? extra - assigned : Math.floor((extra * width) / total);
    assigned += addition;
    return width + addition;
  });
}
