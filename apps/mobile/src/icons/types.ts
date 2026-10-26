/**
 * 图标几何描述。
 *
 * 设计库图标是 SVG，我们只保留它用到的元素子集（path / circle / line / rect /
 * polygon / polyline），把渲染交给 react-native-svg，从而在 iOS / Android / Web
 * 三端得到一致结果。
 */

/** 单个 SVG 元素的几何描述。`fill` 缺省时继承图标整体的填充色。 */
export type IconElement =
  | { tag: "path"; d: string; fill?: string }
  | { tag: "circle"; cx: number; cy: number; r: number; fill?: string }
  | { tag: "line"; x1: number; y1: number; x2: number; y2: number; fill?: string }
  | {
      tag: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      fill?: string;
    }
  | { tag: "polygon"; points: string; fill?: string }
  | { tag: "polyline"; points: string; fill?: string };

/**
 * 图标来源。
 *
 * - `library`：设计库自带资产（几何逐字来自设计库 SVG，未做任何改动）。
 * - `project`：设计库没有对应图标时，按同一视觉语言（24×24 视图框、圆头圆角
 *   描边、无填充）补齐的项目图标。
 */
export type IconSource = "library" | "project";

/** 一个图标的完整定义。 */
export type IconDefinition = {
  /** 该图标在设计库中的原始文件名；项目补齐的图标为 undefined。 */
  asset?: string;
  source: IconSource;
  elements: IconElement[];
};
