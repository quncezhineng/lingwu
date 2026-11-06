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
const SKILL_PAGE_SIZE = 60;

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
}) {
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
          gap: 12,
          minHeight: 58,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderTopWidth: first ? 0 : 1,
          borderTopColor: colors.line,
          backgroundColor: pressed && !disabled ? colors.surface : colors.paper,
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
        <Text style={{ fontSize: 11, color: colors.faint }}>—</Text>
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
 * 技能选择弹层：把 Agent 的自定义技能与技能目录合并成一个可搜索的多选列表，
 * 勾选即时写入对话选择，关闭或点「应用」收起弹层。
 */
export function SkillPickerSheet({
  customSkills,
  selectedIds,
  onToggle,
  onConfirm,
  onClose,
}: {
  customSkills: readonly AgentSkill[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
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
            <OptionList>
              {custom.map((skill, index) => {
                const checked = selectedIds.includes(skill.id);
                return (
                  <OptionRow
                    key={skill.id}
                    first={index === 0}
                    checked={checked}
                    icon={Brain}
                    title={skill.name}
                    detail={skill.purpose}
                    status={skill.enabled ? undefined : t("agentSpace.skillDisabled")}
                    accessibilityLabel={skill.name}
                    onPress={() => onToggle(skill.id)}
                  />
                );
              })}
            </OptionList>
          </View>
        )}
        {visible.length > 0 && (
          <View style={{ gap: 8 }}>
            <SectionHeading title={t("chat.skillPickerCatalogHeading")} count={filtered.length} />
            <OptionList>
              {visible.map((skill, index) => {
                const checked = selectedIds.includes(skill.id);
                const title = zh ? skill.titleZh : skill.titleEn;
                return (
                  <OptionRow
                    key={skill.id}
                    first={index === 0}
                    checked={checked}
                    icon={Brain}
                    title={title}
                    detail={zh ? skill.descriptionZh : skill.descriptionEn}
                    accessibilityLabel={title}
                    onPress={() => onToggle(skill.id)}
                  />
                );
              })}
            </OptionList>
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
}: {
  options: readonly ConnectorOption[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  onManage?: () => void;
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
