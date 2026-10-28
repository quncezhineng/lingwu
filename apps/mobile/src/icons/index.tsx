/**
 * 统一图标模块。
 *
 * 图标几何来自 Doubao 设计库（`library.ts`，40 枚资产逐字转写）与项目补齐
 * 图标（`project.ts`），渲染统一交给 react-native-svg，从而在 iOS / Android / Web
 * 三端得到一致的线宽与端点表现。
 *
 * 使用约定（与 Demo-v7 图标规范一致）：
 * - `strokeWidth`：常规 1.65、底栏 1.7、导航 1.9；不传则取常规值。
 * - `color`：描边色；`fill` 缺省为 `none`（纯描边），传入时为填充态。
 * - `size`：默认 24，实际按调用点传入。
 */
import type { FC } from "react";
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from "react-native-svg";
import { colors, iconStroke } from "../theme";
import { ICON_KEYS } from "./keys";
import { LIBRARY_ICONS } from "./library";
import { PROJECT_ICONS } from "./project";
import type { IconDefinition, IconElement } from "./types";

/** 图标组件的对外参数。 */
export type IconProps = {
  /** 边长，默认 24。 */
  size?: number;
  /** 描边色，默认正文色。 */
  color?: string;
  /** 描边宽度，默认 1.65（常规）。 */
  strokeWidth?: number;
  /** 填充色，缺省 `none`（纯描边）。 */
  fill?: string;
  /** 为 true 时线宽按 24 视图框等比缩放，不随 `size` 放大。 */
  absoluteStrokeWidth?: boolean;
  /** 无障碍标签，供屏幕阅读器朗读图标语义。 */
  accessibilityLabel?: string;
  /** 测试标识。 */
  testID?: string;
};

/** 项目自有图标组件类型，替代第三方图标库的组件类型。 */
export type IconComponent = FC<IconProps>;

/** 常规描边宽度基准（导航 1.9 / 底栏 1.7 见 `iconStroke`）。 */
export const DEFAULT_STROKE_WIDTH = iconStroke.regular;

/** 未显式指定颜色时的兜底前景色，与正文色保持一致。 */
const FALLBACK_COLOR = colors.iconFallback;

/** 图标视图框边长。 */
const VIEW_BOX = 24;

/**
 * 渲染单个几何元素。
 *
 * 设计库个别图标（如 `tag`）在元素上写死了 `currentColor` 填充，这里在渲染期
 * 解析成实际颜色，避免 react-native-svg 在原生端无法解析 `currentColor`。
 */
function renderElement(element: IconElement, color: string, key: number) {
  switch (element.tag) {
    case "path":
      return <Path key={key} d={element.d} />;
    case "circle":
      return (
        <Circle
          key={key}
          cx={element.cx}
          cy={element.cy}
          r={element.r}
          fill={element.fill ? color : undefined}
        />
      );
    case "line":
      return <Line key={key} x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} />;
    case "rect":
      return (
        <Rect
          key={key}
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          rx={element.rx}
        />
      );
    case "polygon":
      return <Polygon key={key} points={element.points} />;
    case "polyline":
      return <Polyline key={key} points={element.points} />;
    default:
      return null;
  }
}

/** 取出图标几何；未注册时立刻报错，避免渲染出空白图标。 */
function resolve(key: string): IconDefinition {
  const definition = LIBRARY_ICONS[key] ?? PROJECT_ICONS[key];
  if (!definition) {
    throw new Error(`[icons] 未注册的图标键：${key}`);
  }
  return definition;
}

/** 由几何定义生成图标组件。 */
function createIcon(name: string, key: string): IconComponent {
  const definition = resolve(key);
  const Icon: IconComponent = ({
    size = VIEW_BOX,
    color = FALLBACK_COLOR,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    fill,
    absoluteStrokeWidth,
    accessibilityLabel,
    testID,
  }) => {
    const resolvedStrokeWidth = absoluteStrokeWidth ? (strokeWidth * VIEW_BOX) / size : strokeWidth;
    return (
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
        fill={fill ?? "none"}
        stroke={color}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        {definition.elements.map((element, index) => renderElement(element, color, index))}
      </Svg>
    );
  };
  Icon.displayName = name;
  return Icon;
}

/**
 * 导出名 → 图标定义的完整注册表，供测试与调试查询。
 *
 * 映射表本体放在 `keys.ts`，此处只做一次解析，便于测试在纯 Node 环境校验。
 */
export const ICON_REGISTRY: Record<string, IconDefinition> = Object.keys(ICON_KEYS).reduce(
  (registry, name) => {
    registry[name] = resolve(ICON_KEYS[name as keyof typeof ICON_KEYS]);
    return registry;
  },
  {} as Record<string, IconDefinition>,
);

export { ICON_KEYS } from "./keys";

export const Activity = createIcon("Activity", ICON_KEYS.Activity);
export const AlertTriangle = createIcon("AlertTriangle", ICON_KEYS.AlertTriangle);
export const Archive = createIcon("Archive", ICON_KEYS.Archive);
export const ArrowDown = createIcon("ArrowDown", ICON_KEYS.ArrowDown);
export const ArrowDownToLine = createIcon("ArrowDownToLine", ICON_KEYS.ArrowDownToLine);
export const ArrowLeft = createIcon("ArrowLeft", ICON_KEYS.ArrowLeft);
export const ArrowRight = createIcon("ArrowRight", ICON_KEYS.ArrowRight);
export const ArrowUp = createIcon("ArrowUp", ICON_KEYS.ArrowUp);
export const ArrowUpRight = createIcon("ArrowUpRight", ICON_KEYS.ArrowUpRight);
export const Bell = createIcon("Bell", ICON_KEYS.Bell);
export const Bot = createIcon("Bot", ICON_KEYS.Bot);
export const Box = createIcon("Box", ICON_KEYS.Box);
export const Brain = createIcon("Brain", ICON_KEYS.Brain);
export const CalendarClock = createIcon("CalendarClock", ICON_KEYS.CalendarClock);
export const CalendarDays = createIcon("CalendarDays", ICON_KEYS.CalendarDays);
export const Check = createIcon("Check", ICON_KEYS.Check);
export const CheckCheck = createIcon("CheckCheck", ICON_KEYS.CheckCheck);
export const ChevronDown = createIcon("ChevronDown", ICON_KEYS.ChevronDown);
export const ChevronLeft = createIcon("ChevronLeft", ICON_KEYS.ChevronLeft);
export const ChevronRight = createIcon("ChevronRight", ICON_KEYS.ChevronRight);
export const ChevronUp = createIcon("ChevronUp", ICON_KEYS.ChevronUp);
export const ChevronsDownUp = createIcon("ChevronsDownUp", ICON_KEYS.ChevronsDownUp);
export const ChevronsUpDown = createIcon("ChevronsUpDown", ICON_KEYS.ChevronsUpDown);
export const CircleAlert = createIcon("CircleAlert", ICON_KEYS.CircleAlert);
export const CircleCheck = createIcon("CircleCheck", ICON_KEYS.CircleCheck);
export const CircleDollarSign = createIcon("CircleDollarSign", ICON_KEYS.CircleDollarSign);
export const CircleMinus = createIcon("CircleMinus", ICON_KEYS.CircleMinus);
export const CirclePlus = createIcon("CirclePlus", ICON_KEYS.CirclePlus);
export const CircleUserRound = createIcon("CircleUserRound", ICON_KEYS.CircleUserRound);
export const CircleX = createIcon("CircleX", ICON_KEYS.CircleX);
export const Clock3 = createIcon("Clock3", ICON_KEYS.Clock3);
export const Cpu = createIcon("Cpu", ICON_KEYS.Cpu);
export const Download = createIcon("Download", ICON_KEYS.Download);
export const Edit3 = createIcon("Edit3", ICON_KEYS.Edit3);
export const ExternalLink = createIcon("ExternalLink", ICON_KEYS.ExternalLink);
export const FilePlus2 = createIcon("FilePlus2", ICON_KEYS.FilePlus2);
export const FileText = createIcon("FileText", ICON_KEYS.FileText);
export const Folder = createIcon("Folder", ICON_KEYS.Folder);
export const FolderOpen = createIcon("FolderOpen", ICON_KEYS.FolderOpen);
export const FolderPlus = createIcon("FolderPlus", ICON_KEYS.FolderPlus);
export const Funnel = createIcon("Funnel", ICON_KEYS.Funnel);
export const Globe2 = createIcon("Globe2", ICON_KEYS.Globe2);
export const Grip = createIcon("Grip", ICON_KEYS.Grip);
export const Hand = createIcon("Hand", ICON_KEYS.Hand);
export const Heart = createIcon("Heart", ICON_KEYS.Heart);
export const Home = createIcon("Home", ICON_KEYS.Home);
export const IdCard = createIcon("IdCard", ICON_KEYS.IdCard);
export const Inbox = createIcon("Inbox", ICON_KEYS.Inbox);
export const Languages = createIcon("Languages", ICON_KEYS.Languages);
export const Lightbulb = createIcon("Lightbulb", ICON_KEYS.Lightbulb);
export const Link2 = createIcon("Link2", ICON_KEYS.Link2);
export const ListChecks = createIcon("ListChecks", ICON_KEYS.ListChecks);
export const LogOut = createIcon("LogOut", ICON_KEYS.LogOut);
export const Mail = createIcon("Mail", ICON_KEYS.Mail);
export const MapPin = createIcon("MapPin", ICON_KEYS.MapPin);
export const Menu = createIcon("Menu", ICON_KEYS.Menu);
export const MessageCircle = createIcon("MessageCircle", ICON_KEYS.MessageCircle);
export const MessageCircleQuestion = createIcon(
  "MessageCircleQuestion",
  ICON_KEYS.MessageCircleQuestion,
);
export const Minus = createIcon("Minus", ICON_KEYS.Minus);
export const Monitor = createIcon("Monitor", ICON_KEYS.Monitor);
export const MoreHorizontal = createIcon("MoreHorizontal", ICON_KEYS.MoreHorizontal);
export const MousePointerClick = createIcon("MousePointerClick", ICON_KEYS.MousePointerClick);
export const PanelsTopLeft = createIcon("PanelsTopLeft", ICON_KEYS.PanelsTopLeft);
export const Pause = createIcon("Pause", ICON_KEYS.Pause);
export const Pencil = createIcon("Pencil", ICON_KEYS.Pencil);
export const Play = createIcon("Play", ICON_KEYS.Play);
export const Plus = createIcon("Plus", ICON_KEYS.Plus);
export const Power = createIcon("Power", ICON_KEYS.Power);
export const RefreshCw = createIcon("RefreshCw", ICON_KEYS.RefreshCw);
export const Reply = createIcon("Reply", ICON_KEYS.Reply);
export const RotateCcw = createIcon("RotateCcw", ICON_KEYS.RotateCcw);
export const RotateCw = createIcon("RotateCw", ICON_KEYS.RotateCw);
export const Save = createIcon("Save", ICON_KEYS.Save);
export const Search = createIcon("Search", ICON_KEYS.Search);
export const Send = createIcon("Send", ICON_KEYS.Send);
export const Settings2 = createIcon("Settings2", ICON_KEYS.Settings2);
export const Shapes = createIcon("Shapes", ICON_KEYS.Shapes);
export const ShieldAlert = createIcon("ShieldAlert", ICON_KEYS.ShieldAlert);
export const ShieldCheck = createIcon("ShieldCheck", ICON_KEYS.ShieldCheck);
export const Sparkles = createIcon("Sparkles", ICON_KEYS.Sparkles);
export const Square = createIcon("Square", ICON_KEYS.Square);
export const SquareCheck = createIcon("SquareCheck", ICON_KEYS.SquareCheck);
export const Star = createIcon("Star", ICON_KEYS.Star);
export const Tag = createIcon("Tag", ICON_KEYS.Tag);
export const Target = createIcon("Target", ICON_KEYS.Target);
export const Terminal = createIcon("Terminal", ICON_KEYS.Terminal);
export const ThumbsDown = createIcon("ThumbsDown", ICON_KEYS.ThumbsDown);
export const ThumbsUp = createIcon("ThumbsUp", ICON_KEYS.ThumbsUp);
export const Trash2 = createIcon("Trash2", ICON_KEYS.Trash2);
export const Upload = createIcon("Upload", ICON_KEYS.Upload);
export const UserRound = createIcon("UserRound", ICON_KEYS.UserRound);
export const Users = createIcon("Users", ICON_KEYS.Users);
export const X = createIcon("X", ICON_KEYS.X);

export type { IconDefinition, IconElement, IconSource } from "./types";
