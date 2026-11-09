const CONCLUSION =
  /(?:^|\n)\s{0,3}#{0,3}\s*(?:结论|摘要|一句话|核心结论|核心发现|关键成果)\s*[:：]?\s*\n+([\s\S]{12,900}?)(?=\n\s*#{1,3}\s|\n{2,}|$)/;

/** 从报告正文里抽出一段能放进对话的摘要。优先用结论段，否则用开头。 */
export function reportExcerpt(markdown: string, max = 280): string {
  const section = CONCLUSION.exec(markdown)?.[1] ?? markdown;
  const plain = section
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  if (plain.length <= max) return plain;
  const window = plain.slice(0, max);
  const end = Math.max(
    window.lastIndexOf("。"),
    window.lastIndexOf("！"),
    window.lastIndexOf("？"),
  );
  if (end >= 40) return window.slice(0, end + 1);
  return `${window.trimEnd()}…`;
}
