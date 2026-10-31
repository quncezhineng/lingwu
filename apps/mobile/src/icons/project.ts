/**
 * 项目补齐图标注册表。
 *
 * Doubao 设计库共提供 40 枚图标，覆盖方向箭头、勾选、文件、邮件、用户、
 * 反馈等基础语义，但没有通知、搜索、日历、终端、更多等界面高频图标。
 * 按设计库规则（“设计库缺少匹配图标时才使用项目内 SVG”），这里用同一套视觉
 * 语言补齐：24×24 视图框、圆头圆角描边、无填充，与设计库资产在重量上保持一致。
 *
 * 补齐图标的描边宽度同样沿用项目基准 1.8（常规）/ 2（强调）/ 0（填充）。
 */
import type { IconDefinition } from "./types";

export const PROJECT_ICONS: Record<string, IconDefinition> = {
  activity: {
    source: "project",
    elements: [{ tag: "path", d: "M22 12h-4l-3 9L9 3l-3 9H2" }],
  },
  archive: {
    source: "project",
    elements: [
      { tag: "rect", x: 2, y: 3, width: 20, height: 5, rx: 1 },
      { tag: "path", d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" },
      { tag: "path", d: "M10 12h4" },
    ],
  },
  "arrow-down-to-line": {
    source: "project",
    elements: [
      { tag: "path", d: "M12 17V3" },
      { tag: "path", d: "m6 11 6 6 6-6" },
      { tag: "path", d: "M19 21H5" },
    ],
  },
  "arrow-up-right": {
    source: "project",
    elements: [
      { tag: "path", d: "M7 17 17 7" },
      { tag: "path", d: "M7 7h10v10" },
    ],
  },
  bell: {
    source: "project",
    elements: [
      { tag: "path", d: "M10.268 21a2 2 0 0 0 3.464 0" },
      {
        tag: "path",
        d: "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
      },
    ],
  },
  bot: {
    source: "project",
    elements: [
      { tag: "path", d: "M12 8V4H8" },
      { tag: "rect", x: 4, y: 8, width: 16, height: 12, rx: 2 },
      { tag: "path", d: "M2 14h2" },
      { tag: "path", d: "M20 14h2" },
      { tag: "path", d: "M15 13v2" },
      { tag: "path", d: "M9 13v2" },
    ],
  },
  brain: {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
      },
      {
        tag: "path",
        d: "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z",
      },
    ],
  },
  "calendar-clock": {
    source: "project",
    elements: [
      { tag: "rect", x: 3, y: 4, width: 18, height: 18, rx: 2 },
      { tag: "path", d: "M8 2v4" },
      { tag: "path", d: "M16 2v4" },
      { tag: "path", d: "M3 10h18" },
      { tag: "path", d: "M16 14v3l2 1" },
    ],
  },
  "calendar-days": {
    source: "project",
    elements: [
      { tag: "rect", x: 3, y: 4, width: 18, height: 18, rx: 2 },
      { tag: "path", d: "M8 2v4" },
      { tag: "path", d: "M16 2v4" },
      { tag: "path", d: "M3 10h18" },
      { tag: "path", d: "M8 14h.01" },
      { tag: "path", d: "M12 14h.01" },
      { tag: "path", d: "M16 14h.01" },
      { tag: "path", d: "M8 17.5h.01" },
      { tag: "path", d: "M12 17.5h.01" },
      { tag: "path", d: "M16 17.5h.01" },
    ],
  },
  "check-check": {
    source: "project",
    elements: [
      { tag: "path", d: "M18 6 7 17l-4-4" },
      { tag: "path", d: "m22 10-7.5 7.5L13 16" },
    ],
  },
  "circle-dollar-sign": {
    source: "project",
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "path", d: "M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" },
      { tag: "path", d: "M12 18V6" },
    ],
  },
  "circle-x": {
    source: "project",
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "path", d: "m15 9-6 6" },
      { tag: "path", d: "m9 9 6 6" },
    ],
  },
  clock: {
    source: "project",
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "path", d: "M12 6v6l4 2" },
    ],
  },
  cpu: {
    source: "project",
    elements: [
      { tag: "rect", x: 4, y: 4, width: 16, height: 16, rx: 2 },
      { tag: "rect", x: 9, y: 9, width: 6, height: 6 },
      { tag: "path", d: "M15 2v2" },
      { tag: "path", d: "M9 2v2" },
      { tag: "path", d: "M15 20v2" },
      { tag: "path", d: "M9 20v2" },
      { tag: "path", d: "M2 15h2" },
      { tag: "path", d: "M2 9h2" },
      { tag: "path", d: "M20 15h2" },
      { tag: "path", d: "M20 9h2" },
    ],
  },
  download: {
    source: "project",
    elements: [
      { tag: "path", d: "M12 15V3" },
      { tag: "path", d: "m7 10 5 5 5-5" },
      { tag: "path", d: "M20 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" },
    ],
  },
  "file-plus": {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      },
      { tag: "path", d: "M14 2v5a1 1 0 0 0 1 1h5" },
      { tag: "path", d: "M9 15h6" },
      { tag: "path", d: "M12 12v6" },
    ],
  },
  "folder-plus": {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
      },
      { tag: "path", d: "M12 10v6" },
      { tag: "path", d: "M9 13h6" },
    ],
  },
  globe: {
    source: "project",
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "path", d: "M2 12h20" },
      {
        tag: "path",
        d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10",
      },
    ],
  },
  hand: {
    source: "project",
    elements: [
      { tag: "path", d: "M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" },
      { tag: "path", d: "M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" },
      { tag: "path", d: "M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" },
      {
        tag: "path",
        d: "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
      },
    ],
  },
  "id-card": {
    source: "project",
    elements: [
      { tag: "rect", x: 2, y: 4, width: 20, height: 16, rx: 2 },
      { tag: "circle", cx: 8, cy: 10, r: 2 },
      { tag: "path", d: "M4.5 16.5c.8-1 2-1.5 3.5-1.5s2.7.5 3.5 1.5" },
      { tag: "path", d: "M15 9h4" },
      { tag: "path", d: "M15 13h3" },
    ],
  },
  inbox: {
    source: "project",
    elements: [
      { tag: "path", d: "M22 12h-6l-2 3h-4l-2-3H2" },
      {
        tag: "path",
        d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
      },
    ],
  },
  languages: {
    source: "project",
    elements: [
      { tag: "path", d: "m5 8 6 6" },
      { tag: "path", d: "m4 14 6-6 2-3" },
      { tag: "path", d: "m2 5 3-3 3 3" },
      { tag: "path", d: "M22 22l-5-10-5 10" },
      { tag: "path", d: "M14 18h6" },
    ],
  },
  lightbulb: {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
      },
      { tag: "path", d: "M9 18h6" },
      { tag: "path", d: "M10 22h4" },
    ],
  },
  link: {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
      },
      {
        tag: "path",
        d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
      },
    ],
  },
  "list-checks": {
    source: "project",
    elements: [
      { tag: "path", d: "m3 17 2 2 4-4" },
      { tag: "path", d: "m3 7 2 2 4-4" },
      { tag: "path", d: "M13 6h8" },
      { tag: "path", d: "M13 12h8" },
      { tag: "path", d: "M13 18h8" },
    ],
  },
  "log-out": {
    source: "project",
    elements: [
      { tag: "path", d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" },
      { tag: "path", d: "m16 17 5-5-5-5" },
      { tag: "path", d: "M21 12H9" },
    ],
  },
  menu: {
    source: "project",
    elements: [
      { tag: "path", d: "M4 6h16" },
      { tag: "path", d: "M4 12h16" },
      { tag: "path", d: "M4 18h16" },
    ],
  },
  minus: {
    source: "project",
    elements: [{ tag: "path", d: "M5 12h14" }],
  },
  monitor: {
    source: "project",
    elements: [
      { tag: "rect", x: 2, y: 3, width: 20, height: 14, rx: 2 },
      { tag: "path", d: "M8 21h8" },
      { tag: "path", d: "M12 17v4" },
    ],
  },
  "more-horizontal": {
    source: "project",
    elements: [
      { tag: "circle", cx: 5, cy: 12, r: 1 },
      { tag: "circle", cx: 12, cy: 12, r: 1 },
      { tag: "circle", cx: 19, cy: 12, r: 1 },
    ],
  },
  "panel-left-close": {
    source: "project",
    elements: [
      { tag: "rect", x: 3, y: 3, width: 18, height: 18, rx: 2 },
      { tag: "path", d: "M9 3v18" },
      { tag: "path", d: "m16 15-3-3 3-3" },
    ],
  },
  "panel-left-open": {
    source: "project",
    elements: [
      { tag: "rect", x: 3, y: 3, width: 18, height: 18, rx: 2 },
      { tag: "path", d: "M9 3v18" },
      { tag: "path", d: "m14 9 3 3-3 3" },
    ],
  },
  "panels-top-left": {
    source: "project",
    elements: [
      { tag: "rect", x: 3, y: 3, width: 18, height: 18, rx: 2 },
      { tag: "path", d: "M9 3v18" },
      { tag: "path", d: "M9 9h12" },
    ],
  },
  plus: {
    source: "project",
    elements: [
      { tag: "path", d: "M5 12h14" },
      { tag: "path", d: "M12 5v14" },
    ],
  },
  power: {
    source: "project",
    elements: [
      { tag: "path", d: "M12 2v10" },
      { tag: "path", d: "M18.4 6.6a9 9 0 1 1-12.77.04" },
    ],
  },
  reply: {
    source: "project",
    elements: [
      { tag: "path", d: "M9 17H5V7h4" },
      { tag: "path", d: "m5 7 7 5-7 5" },
      { tag: "path", d: "M12 12h7a2 2 0 0 1 2 2v4" },
    ],
  },
  "rotate-ccw": {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
      },
      { tag: "path", d: "M3 3v5h5" },
    ],
  },
  "rotate-cw": {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8",
      },
      { tag: "path", d: "M21 3v5h-5" },
    ],
  },
  save: {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
      },
      { tag: "path", d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" },
      { tag: "path", d: "M7 3v4a1 1 0 0 0 1 1h7" },
    ],
  },
  search: {
    source: "project",
    elements: [
      { tag: "circle", cx: 11, cy: 11, r: 8 },
      { tag: "path", d: "m21 21-4.3-4.3" },
    ],
  },
  settings: {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
      },
      { tag: "circle", cx: 12, cy: 12, r: 3 },
    ],
  },
  shapes: {
    source: "project",
    elements: [
      { tag: "path", d: "M7.5 4 3 12h9z" },
      { tag: "rect", x: 13, y: 12, width: 8, height: 8, rx: 1 },
      { tag: "circle", cx: 18, cy: 7, r: 3.5 },
    ],
  },
  "shield-alert": {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      },
      { tag: "path", d: "M12 8v4" },
      { tag: "path", d: "M12 16h.01" },
    ],
  },
  "shield-check": {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      },
      { tag: "path", d: "m9 12 2 2 4-4" },
    ],
  },
  sparkles: {
    source: "project",
    elements: [
      {
        tag: "path",
        d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
      },
      { tag: "path", d: "M20 3v4" },
      { tag: "path", d: "M22 5h-4" },
      { tag: "path", d: "M4 17v2" },
      { tag: "path", d: "M5 18h-2" },
    ],
  },
  square: {
    source: "project",
    elements: [{ tag: "rect", x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  },
  "square-check": {
    source: "project",
    elements: [
      { tag: "rect", x: 3, y: 3, width: 18, height: 18, rx: 3 },
      { tag: "path", d: "m8 12 3 3 5-6" },
    ],
  },
  target: {
    source: "project",
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "circle", cx: 12, cy: 12, r: 6 },
      { tag: "circle", cx: 12, cy: 12, r: 2 },
    ],
  },
  terminal: {
    source: "project",
    elements: [
      { tag: "path", d: "m4 17 6-6-6-6" },
      { tag: "path", d: "M12 19h8" },
    ],
  },
  upload: {
    source: "project",
    elements: [
      { tag: "path", d: "M12 3v12" },
      { tag: "path", d: "m7 8 5-5 5 5" },
      { tag: "path", d: "M20 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" },
    ],
  },
  users: {
    source: "project",
    elements: [
      { tag: "path", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" },
      { tag: "circle", cx: 9, cy: 7, r: 4 },
      { tag: "path", d: "M22 21v-2a4 4 0 0 0-3-3.87" },
      { tag: "path", d: "M16 3.13a4 4 0 0 1 0 7.75" },
    ],
  },
  x: {
    source: "project",
    elements: [
      { tag: "path", d: "M18 6 6 18" },
      { tag: "path", d: "m6 6 12 12" },
    ],
  },
};

/** 项目补齐图标总数，供注册表完整性测试断言。 */
export const PROJECT_ICON_COUNT = Object.keys(PROJECT_ICONS).length;
