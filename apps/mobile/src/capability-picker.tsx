import { type ReactNode, useState } from "react";
import { Platform, Pressable, type TextStyle, View } from "react-native";
import type { Workspace } from "../../../packages/domain/src";
import type { AgentSkill } from "./agent-space-model";
import { Text, TextInput } from "./app-text";
import { getActiveLocale, useTranslation } from "./i18n";
import { tr } from "./i18n/translate";
import {
  Brain,
  CalendarDays,
  Check,
  FileText,
  Globe2,
  type IconComponent,
  Link2,
  Mail,
  Search as SearchIcon,
  Sparkles,
  X,
} from "./icons";
import { skillCatalog } from "./skill-catalog";
import { Button, colors, Empty, IconButton, radius, SectionHeading, Sheet, s } from "./ui";

/** 无关键词时目录一次渲染的技能上限，避免把 180+ 条技能全部铺进滚动列表。 */
const SKILL_PAGE_SIZE = 80;

/** 技能网格列间距。 */
const OPTION_GRID_GAP = 8;

/** 列宽达到这个值才在格子里补一行说明；窄格子只留标题，避免被挤成省略号。 */
const OPTION_CELL_DETAIL_MIN_WIDTH = 240;

const noFocusRing =
  Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : undefined;

/** 输入区上方展示的已选技能 / 连接器。 */
export type ComposerSelection = { id: string; name: string };

export type ConnectorOption = {
  id: string;
  name: string;
  detail: string;
  connected: boolean;
  icon: IconComponent;
};

/**
 * 当前工作区可选的连接器。状态取自服务端快照，未连接的连接器在选择弹层里不可勾选，
 * 保证带进对话的始终是真正可用的能力。
 */
export function connectorOptions(workspace: Workspace): ConnectorOption[] {
  const googleConnected = workspace.connections.some(
    (connection) =>
      connection.id === "google" &&
      (connection.status === "connected" || connection.status === "sample"),
  );
  const browserConnected = workspace.connections.some(
    (connection) => connection.id === "browser" && connection.status === "connected",
  );
  return [
    {
      id: "gmail",
      name: "Gmail",
      detail: tr("agent.hubGmailDetail"),
      connected: googleConnected,
      icon: Mail,
    },
    {
      id: "calendar",
      name: "Google Calendar",
      detail: tr("agent.hubCalendarDetail"),
      connected: googleConnected,
      icon: CalendarDays,
    },
    {
      id: "browser",
      name: tr("threads.agentComputer"),
      detail: tr("agent.hubBrowserDetail"),
      connected: browserConnected,
      icon: Globe2,
    },
    {
      id: "openbot",
      name: "OpenBot",
      detail: tr("agent.hubOpenBotDetail"),
      connected: Boolean(workspace.runtime.openbotConfigured),
      icon: Sparkles,
    },
  ];
}

/** 技能展示名：先找 Agent 自定义技能，再找技能目录，最后回退到 id。 */
export function skillDisplayName(id: string, customSkills: readonly AgentSkill[]): string {
  const custom = customSkills.find((skill) => skill.id === id);
  if (custom) return custom.name;
  const entry = skillCatalog.find((skill) => skill.id === id);
  if (!entry) return id;
  return getActiveLocale() === "zh-Hans" ? entry.titleZh : entry.titleEn;
}

/** 输入区上方的已选能力 chips，与附件 chips 同排展示。 */
export function ComposerSelectionChips({
  items,
  icon: Icon,
  removeLabel,
  onRemove,
}: {
  items: readonly ComposerSelection[];
  icon: IconComponent;
  removeLabel: (name: string) => string;
  onRemove: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <View style={[s.row, { gap: 6, flexWrap: "wrap", padding: 4, paddingBottom: 8 }]}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={removeLabel(item.name)}
          onPress={() => onRemove(item.id)}
          style={({ pressed }) => [
            s.row,
            {
              gap: 7,
              maxWidth: "100%",
              backgroundColor: pressed ? colors.overlay1 : colors.sky,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 7,
            },
          ]}
        >
          <Icon size={14} color={colors.primary} />
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color: colors.text }}>
            {item.name}
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>×</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SelectionBox({ checked }: { checked: boolean }) {
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 5,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: checked ? colors.primary : colors.paper,
        borderWidth: 1,
        borderColor: checked ? colors.primary : colors.lineStrong,
      }}
    >
      {checked && <Check size={13} strokeWidth={2.2} color={colors.onPrimary} />}
    </View>
  );
}

function OptionRow({
  checked,
  disabled,
  icon: Icon,
  title,
  detail,
  status,
  first,
  accessibilityLabel,
  onPress,
  onConnect,
  connectLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  icon: IconComponent;
  title: string;
  detail?: string;
  status?: string;
  first: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  /** 未连接的连接器行提供「去连接」引导：整行可点击并交给外层进入连接流程。 */
  onConnect?: () => void;
  /** 「去连接」引导文字，仅在 disabled 且提供了 onConnect 时展示。 */
  connectLabel?: string;
}) {
  // 仅当既未连接、又没有连接引导时才真正屏蔽点击；
  // 提供 onConnect 的行保留整行点击，交给上层引导用户去完成连接。
  const blocked = disabled && !onConnect;
  return (
    <Pressable
      accessibilityRole={blocked ? "checkbox" : "button"}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled: blocked }}
      disabled={blocked}
      onPress={() => (disabled && onConnect ? onConnect() : onPress())}
      style={({ pressed }) => [
        s.row,
        {
          gap: 12,
          minHeight: 58,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderTopWidth: first ? 0 : 1,
          borderTopColor: colors.line,
          backgroundColor: pressed && !blocked ? colors.surface : colors.paper,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Icon size={16} color={colors.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
          {title}
        </Text>
        <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
          {!!detail && (
            <Text
              numberOfLines={2}
              style={{ flexShrink: 1, fontSize: 11, lineHeight: 15, color: colors.faint }}
            >
              {detail}
            </Text>
          )}
          {!!status && (
            <Text style={{ fontSize: 11, lineHeight: 15, color: colors.muted }}>{status}</Text>
          )}
        </View>
      </View>
      {disabled ? (
        onConnect && connectLabel ? (
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
            {connectLabel}
          </Text>
        ) : (
          <Text style={{ fontSize: 11, color: colors.faint }}>—</Text>
        )
      ) : (
        <SelectionBox checked={checked} />
      )}
    </Pressable>
  );
}

function PickerSearch({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        s.row,
        {
          gap: 8,
          minHeight: 44,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.field,
          backgroundColor: colors.paper,
        },
      ]}
    >
      <SearchIcon size={18} color={colors.muted} />
      <TextInput
        autoFocus
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        style={[{ flex: 1, minHeight: 42, color: colors.text, fontSize: 14 }, noFocusRing]}
      />
      {value.length > 0 && (
        <IconButton icon={X} label={t("search.clear")} onPress={() => onChangeText("")} />
      )}
    </View>
  );
}

function PickerFooter({
  summary,
  confirmLabel,
  confirmDisabled,
  onConfirm,
}: {
  summary: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <View style={[s.row, { gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 16 }]}>
      <Text style={[s.small, { flex: 1, minWidth: 100 }]}>{summary}</Text>
      <Button primary disabled={confirmDisabled} onPress={onConfirm}>
        {confirmLabel}
      </Button>
    </View>
  );
}

function OptionList({ children }: { children: ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12 }}>{children}</View>
  );
}

/**
 * 技能两列网格：用 onLayout 实测容器宽度换算列宽——弹层在桌面端最宽 760、
 * 手机上接近满宽，用窗口宽度估算会让格子在首帧错位。
 * 实测到之前用 48% 兜底，保证一开始就是两列。
 */
function OptionGrid({ children }: { children: (cellWidth: number) => ReactNode }) {
  const [width, setWidth] = useState(0);
  const cellWidth = width > 0 ? (width - OPTION_GRID_GAP) / 2 : 0;
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: OPTION_GRID_GAP }}
    >
      {children(cellWidth)}
    </View>
  );
}

/**
 * 网格单元：两列时把原来的「整行 + 分隔线」压成独立小卡片，
 * 勾选态用底色 + 描边表达（不再依赖行间分隔线）。
 */
function OptionCard({
  checked,
  disabled,
  icon: Icon,
  title,
  detail,
  status,
  cellWidth,
  accessibilityLabel,
  onPress,
  onViewDetail,
  detailLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  icon: IconComponent;
  title: string;
  detail?: string;
  status?: string;
  /** 由 OptionGrid 实测出的列宽，格子据此撑满半栏。 */
  cellWidth: number;
  accessibilityLabel: string;
  onPress: () => void;
  /** 传入即在复选框左侧显示详情按钮；stopPropagation 保证点击不会顺带切换勾选。 */
  onViewDetail?: () => void;
  detailLabel?: string;
}) {
  // 状态（如「已停用」）比描述更重要，窄格子也要保留；描述只在宽格子补一行。
  const sub = status ?? (cellWidth >= OPTION_CELL_DETAIL_MIN_WIDTH ? detail : undefined);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        {
          width: cellWidth || "48%",
          gap: 9,
          minHeight: 52,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: checked ? colors.primary : colors.line,
          borderRadius: radius.field,
          backgroundColor:
            checked && !disabled
              ? colors.sky
              : pressed && !disabled
                ? colors.surface
                : colors.paper,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Icon size={14} color={colors.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
          {title}
        </Text>
        {!!sub && (
          <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 15, color: colors.faint }}>
            {sub}
          </Text>
        )}
      </View>
      <View style={[s.row, { gap: 6, flexShrink: 0 }]}>
        {onViewDetail && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={detailLabel}
            hitSlop={6}
            onPress={(event) => {
              event.stopPropagation();
              onViewDetail();
            }}
            style={({ pressed }) => ({
              width: 24,
              height: 24,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: pressed ? colors.surface : colors.paper,
            })}
          >
            <FileText size={13} color={colors.muted} />
          </Pressable>
        )}
        {disabled ? (
          <Text style={{ fontSize: 11, color: colors.faint }}>—</Text>
        ) : (
          <SelectionBox checked={checked} />
        )}
      </View>
    </Pressable>
  );
}

/**
 * 技能选择弹层：把 Agent 的自定义技能与技能目录合并成一个可搜索的多选列表，
 * 勾选即时写入对话选择，关闭或点「应用」收起弹层。
 * 每张卡片另有详情按钮，通过 onInspectSkill 交给调用方挂载只读详情弹层，避免嵌套 Modal。
 */
export function SkillPickerSheet({
  customSkills,
  selectedIds,
  onToggle,
  onConfirm,
  onClose,
  onInspectSkill,
}: {
  customSkills: readonly AgentSkill[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  /** 点卡片上的详情按钮：由调用方作为兄弟节点挂载技能详情弹层。 */
  onInspectSkill?: (id: string) => void;
}) {
  const { t, locale } = useTranslation();
  const [query, setQuery] = useState("");
  const zh = locale === "zh-Hans";
  const keyword = query.trim().toLowerCase();
  const matches = (...values: string[]) =>
    !keyword || values.some((value) => value.toLowerCase().includes(keyword));

  const custom = customSkills.filter((skill) => matches(skill.name, skill.purpose));
  const filtered = skillCatalog.filter((skill) =>
    matches(skill.titleZh, skill.titleEn, skill.descriptionZh, skill.descriptionEn, skill.id),
  );
  const visible = filtered.slice(0, SKILL_PAGE_SIZE);
  const hidden = filtered.length - visible.length;
  const selectedCount = selectedIds.length;

  return (
    <Sheet
      title={t("chat.skillPickerTitle")}
      subtitle={t("chat.skillPickerSubtitle")}
      onClose={onClose}
    >
      <View style={{ gap: 14 }}>
        <PickerSearch
          value={query}
          onChangeText={setQuery}
          placeholder={t("chat.skillPickerSearch")}
        />
        {custom.length > 0 && (
          <View style={{ gap: 8 }}>
            <SectionHeading title={t("chat.skillPickerMineHeading")} count={custom.length} />
            <OptionGrid>
              {(cellWidth) =>
                custom.map((skill) => {
                  const checked = selectedIds.includes(skill.id);
                  return (
                    <OptionCard
                      key={skill.id}
                      cellWidth={cellWidth}
                      checked={checked}
                      icon={Brain}
                      title={skill.name}
                      detail={skill.purpose}
                      status={skill.enabled ? undefined : t("agentSpace.skillDisabled")}
                      accessibilityLabel={skill.name}
                      onPress={() => onToggle(skill.id)}
                      onViewDetail={onInspectSkill ? () => onInspectSkill(skill.id) : undefined}
                      detailLabel={t("chat.skillPickerDetail")}
                    />
                  );
                })
              }
            </OptionGrid>
          </View>
        )}
        {visible.length > 0 && (
          <View style={{ gap: 8 }}>
            <SectionHeading title={t("chat.skillPickerCatalogHeading")} count={filtered.length} />
            <OptionGrid>
              {(cellWidth) =>
                visible.map((skill) => {
                  const checked = selectedIds.includes(skill.id);
                  const title = zh ? skill.titleZh : skill.titleEn;
                  return (
                    <OptionCard
                      key={skill.id}
                      cellWidth={cellWidth}
                      checked={checked}
                      icon={Brain}
                      title={title}
                      detail={zh ? skill.descriptionZh : skill.descriptionEn}
                      accessibilityLabel={title}
                      onPress={() => onToggle(skill.id)}
                      onViewDetail={onInspectSkill ? () => onInspectSkill(skill.id) : undefined}
                      detailLabel={t("chat.skillPickerDetail")}
                    />
                  );
                })
              }
            </OptionGrid>
            {hidden > 0 && (
              <Text style={s.small}>{t("chat.skillPickerMore", { count: hidden })}</Text>
            )}
          </View>
        )}
        {custom.length === 0 && visible.length === 0 && (
          <Empty
            icon={Brain}
            title={t("chat.skillPickerEmptyTitle")}
            detail={t("chat.skillPickerEmptyDetail")}
          />
        )}
        <PickerFooter
          summary={t("chat.skillPickerSelected", { count: selectedCount })}
          confirmLabel={t("chat.skillPickerConfirm", { count: selectedCount })}
          onConfirm={onConfirm}
        />
      </View>
    </Sheet>
  );
}

/**
 * 连接器选择弹层：只允许勾选已连接的连接器；未连接时给出跳转连接管理的入口。
 */
export function ConnectorPickerSheet({
  options,
  selectedIds,
  onToggle,
  onConfirm,
  onClose,
  onManage,
  onConnect,
}: {
  options: readonly ConnectorOption[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  onManage?: () => void;
  /** 点击未连接的连接器行时触发的「去连接」引导（如进入连接管理页）。 */
  onConnect?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const selectedCount = selectedIds.length;
  return (
    <Sheet
      title={t("chat.connectorPickerTitle")}
      subtitle={t("chat.connectorPickerSubtitle")}
      onClose={onClose}
    >
      <View style={{ gap: 14 }}>
        {options.length > 0 ? (
          <OptionList>
            {options.map((option, index) => (
              <OptionRow
                key={option.id}
                first={index === 0}
                checked={selectedIds.includes(option.id)}
                disabled={!option.connected}
                icon={option.icon}
                title={option.name}
                detail={option.detail}
                status={t(
                  option.connected
                    ? "chat.connectorPickerConnected"
                    : "chat.connectorPickerDisconnected",
                )}
                accessibilityLabel={option.name}
                onPress={() => onToggle(option.id)}
                onConnect={option.connected ? undefined : () => onConnect?.(option.id)}
                connectLabel={option.connected ? undefined : t("chat.connectorPickerConnect")}
              />
            ))}
          </OptionList>
        ) : (
          <Empty
            icon={Link2}
            title={t("chat.connectorPickerEmptyTitle")}
            detail={t("chat.connectorPickerEmptyDetail")}
          />
        )}
        <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          {onManage && (
            <Button small onPress={onManage}>
              {t("chat.connectorPickerManage")}
            </Button>
          )}
        </View>
        <PickerFooter
          summary={t("chat.connectorPickerSelected", { count: selectedCount })}
          confirmLabel={t("chat.connectorPickerConfirm", { count: selectedCount })}
          onConfirm={onConfirm}
        />
      </View>
    </Sheet>
  );
}
