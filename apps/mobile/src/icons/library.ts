/**
 * 设计库图标注册表（Doubao / V.3RSOA.PBS1K2）。
 *
 * 这里登记的全部几何均逐字来自设计库 `assets/icons/*.svg`，未做任何删改：
 * 24×24 视图框、currentColor 描边、圆头圆角。
 * 项目运行时不读取设计库目录，直接消费这份编译进包内的几何数据，
 * 以保证 iOS / Android / Web 三端渲染一致。
 *
 * 设计库未提供的语义图标登记在 `project.ts`，来源标记为 `source: "project"`。
 */
import type { IconDefinition } from "./types";

export const LIBRARY_ICONS: Record<string, IconDefinition> = {
  "arrow-down": {
    asset: "arrow-down.svg",
    source: "library",
    elements: [
      { tag: "path", d: "M12 5v14" },
      { tag: "path", d: "m19 12-7 7-7-7" },
    ],
  },
  "arrow-left": {
    asset: "arrow-left.svg",
    source: "library",
    elements: [
      { tag: "path", d: "m12 19-7-7 7-7" },
      { tag: "path", d: "M19 12H5" },
    ],
  },
  "arrow-right": {
    asset: "arrow-right.svg",
    source: "library",
    elements: [
      { tag: "path", d: "M5 12h14" },
      { tag: "path", d: "m12 5 7 7-7 7" },
    ],
  },
  "arrow-up": {
    asset: "arrow-up.svg",
    source: "library",
    elements: [
      { tag: "path", d: "m5 12 7-7 7 7" },
      { tag: "path", d: "M12 19V5" },
    ],
  },
  box: {
    asset: "box.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
      },
      { tag: "path", d: "m3.3 7 8.7 5 8.7-5" },
      { tag: "path", d: "M12 22V12" },
    ],
  },
  check: {
    asset: "check.svg",
    source: "library",
    elements: [{ tag: "path", d: "M20 6 9 17l-5-5" }],
  },
  "chevron-down": {
    asset: "chevron-down.svg",
    source: "library",
    elements: [{ tag: "path", d: "m6 9 6 6 6-6" }],
  },
  "chevron-left": {
    asset: "chevron-left.svg",
    source: "library",
    elements: [{ tag: "path", d: "m15 18-6-6 6-6" }],
  },
  "chevron-right": {
    asset: "chevron-right.svg",
    source: "library",
    elements: [{ tag: "path", d: "m9 18 6-6-6-6" }],
  },
  "chevron-up": {
    asset: "chevron-up.svg",
    source: "library",
    elements: [{ tag: "path", d: "m18 15-6-6-6 6" }],
  },
  "chevrons-down-up": {
    asset: "chevrons-down-up.svg",
    source: "library",
    elements: [
      { tag: "path", d: "m7 20 5-5 5 5" },
      { tag: "path", d: "m7 4 5 5 5-5" },
    ],
  },
  "chevrons-up-down": {
    asset: "chevrons-up-down.svg",
    source: "library",
    elements: [
      { tag: "path", d: "m7 15 5 5 5-5" },
      { tag: "path", d: "m7 9 5-5 5 5" },
    ],
  },
  "circle-alert": {
    asset: "circle-alert.svg",
    source: "library",
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "line", x1: 12, y1: 8, x2: 12, y2: 12 },
      { tag: "line", x1: 12, y1: 16, x2: 12.01, y2: 16 },
    ],
  },
  "circle-check": {
    asset: "circle-check.svg",
    source: "library",
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "path", d: "m9 12 2 2 4-4" },
    ],
  },
  "circle-minus": {
    asset: "circle-minus.svg",
    source: "library",
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "path", d: "M8 12h8" },
    ],
  },
  "circle-pause": {
    asset: "circle-pause.svg",
    source: "library",
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "line", x1: 10, y1: 15, x2: 10, y2: 9 },
      { tag: "line", x1: 14, y1: 15, x2: 14, y2: 9 },
    ],
  },
  "circle-play": {
    asset: "circle-play.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z",
      },
      { tag: "circle", cx: 12, cy: 12, r: 10 },
    ],
  },
  "circle-plus": {
    asset: "circle-plus.svg",
    source: "library",
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "path", d: "M8 12h8" },
      { tag: "path", d: "M12 8v8" },
    ],
  },
  "circle-question-mark": {
    asset: "circle-question-mark.svg",
    source: "library",
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "path", d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" },
      { tag: "path", d: "M12 17h.01" },
    ],
  },
  "external-link": {
    asset: "external-link.svg",
    source: "library",
    elements: [
      { tag: "path", d: "M15 3h6v6" },
      { tag: "path", d: "M10 14 21 3" },
      { tag: "path", d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" },
    ],
  },
  file: {
    asset: "file.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      },
      { tag: "path", d: "M14 2v5a1 1 0 0 0 1 1h5" },
    ],
  },
  folder: {
    asset: "folder.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
      },
    ],
  },
  "folder-open": {
    asset: "folder-open.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
      },
    ],
  },
  funnel: {
    asset: "funnel.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",
      },
    ],
  },
  grip: {
    asset: "grip.svg",
    source: "library",
    elements: [
      { tag: "circle", cx: 12, cy: 5, r: 1 },
      { tag: "circle", cx: 19, cy: 5, r: 1 },
      { tag: "circle", cx: 5, cy: 5, r: 1 },
      { tag: "circle", cx: 12, cy: 12, r: 1 },
      { tag: "circle", cx: 19, cy: 12, r: 1 },
      { tag: "circle", cx: 5, cy: 12, r: 1 },
      { tag: "circle", cx: 12, cy: 19, r: 1 },
      { tag: "circle", cx: 19, cy: 19, r: 1 },
      { tag: "circle", cx: 5, cy: 19, r: 1 },
    ],
  },
  heart: {
    asset: "heart.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
      },
    ],
  },
  house: {
    asset: "house.svg",
    source: "library",
    elements: [
      { tag: "path", d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" },
      {
        tag: "path",
        d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
      },
    ],
  },
  mail: {
    asset: "mail.svg",
    source: "library",
    elements: [
      { tag: "path", d: "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" },
      { tag: "rect", x: 2, y: 4, width: 20, height: 16, rx: 2 },
    ],
  },
  "map-pin": {
    asset: "map-pin.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
      },
      { tag: "circle", cx: 12, cy: 10, r: 3 },
    ],
  },
  "message-circle-more": {
    asset: "message-circle-more.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
      },
      { tag: "path", d: "M8 12h.01" },
      { tag: "path", d: "M12 12h.01" },
      { tag: "path", d: "M16 12h.01" },
    ],
  },
  "mouse-pointer-click": {
    asset: "mouse-pointer-click.svg",
    source: "library",
    elements: [
      { tag: "path", d: "M14 4.1 12 6" },
      { tag: "path", d: "m5.1 8-2.9-.8" },
      { tag: "path", d: "m6 12-1.9 2" },
      { tag: "path", d: "M7.2 2.2 8 5.1" },
      {
        tag: "path",
        d: "M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z",
      },
    ],
  },
  "pen-line": {
    asset: "pen-line.svg",
    source: "library",
    elements: [
      { tag: "path", d: "M13 21h8" },
      {
        tag: "path",
        d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
      },
    ],
  },
  "send-horizontal": {
    asset: "send-horizontal.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z",
      },
      { tag: "path", d: "M6 12h16" },
    ],
  },
  star: {
    asset: "star.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
      },
    ],
  },
  tag: {
    asset: "tag.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",
      },
      { tag: "circle", cx: 7.5, cy: 7.5, r: 0.5, fill: "currentColor" },
    ],
  },
  "thumbs-down": {
    asset: "thumbs-down.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z",
      },
      { tag: "path", d: "M17 14V2" },
    ],
  },
  "thumbs-up": {
    asset: "thumbs-up.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z",
      },
      { tag: "path", d: "M7 10v12" },
    ],
  },
  "trash-2": {
    asset: "trash-2.svg",
    source: "library",
    elements: [
      { tag: "path", d: "M10 11v6" },
      { tag: "path", d: "M14 11v6" },
      { tag: "path", d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" },
      { tag: "path", d: "M3 6h18" },
      { tag: "path", d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" },
    ],
  },
  "triangle-alert": {
    asset: "triangle-alert.svg",
    source: "library",
    elements: [
      {
        tag: "path",
        d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      },
      { tag: "path", d: "M12 9v4" },
      { tag: "path", d: "M12 17h.01" },
    ],
  },
  user: {
    asset: "user.svg",
    source: "library",
    elements: [
      { tag: "path", d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" },
      { tag: "circle", cx: 12, cy: 7, r: 4 },
    ],
  },
};

/** 设计库提供的图标总数，供注册表完整性测试断言。 */
export const LIBRARY_ICON_COUNT = 40;
