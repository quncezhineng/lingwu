import { useState } from "react";
import { Platform, Pressable, type TextStyle, useWindowDimensions, View } from "react-native";
import { useAgentSpace } from "./agent-space";
import type { AgentSkill } from "./agent-space-model";
import { Text, TextInput } from "./app-text";
import { useTranslation } from "./i18n";
import { FileText, Plus, Search } from "./icons";
import { type SkillCatalogEntry, skillCatalog } from "./skill-catalog";
import { StatusBadge } from "./status-badge";
import { colors, radius, s } from "./ui";

/** 两列网格 / 单列列表各自一次渲染的条数，避免把 180+ 条目录一次铺进页面。 */
const GRID_PAGE_SIZE = 120;
const LIST_PAGE_SIZE = 80;
/** 内容列宽达到该值才排两列，窄屏保持单列以免标题被挤没。 */
const GRID_MIN_WIDTH = 400;
/** 两列时格子之间的间距。 */
const GRID_GAP = 8;

/** 技能库的一条：内置目录技能与用户自建技能统一后的展示与操作数据。 */
type LibraryEntry = {
  key: string;
  title: string;
  description: string;
  installed: boolean;
  catalog?: SkillCatalogEntry;
  custom?: AgentSkill;
};

/**
 * 技能库条目：宽屏两列只留标题 + 状态，窄屏单列补一行说明。
 * 点击安装 / 再次点击移除；长按打开详情看完整说明。
 */
function SkillLibraryItem({
  title,
  description,
  installed,
  custom,
  grid,
  cellWidth,
  onToggle,
  onViewDetail,
}: {
  title: string;
  description: string;
  installed: boolean;
  /** 用户自建技能：标题前加「自建」小标签，与内置目录技能区分。 */
  custom?: boolean;
  grid: boolean;
  cellWidth: number;
  onToggle: () => void;
  onViewDetail: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={custom ? `${t("agentSpace.addSkillCustomTag")} · ${title}` : title}
      accessibilityHint={t("agentSpace.addSkillDetailHint")}
      accessibilityState={{ checked: installed }}
      onPress={onToggle}
      onLongPress={onViewDetail}
      style={({ pressed }) => [
        s.row,
        {
          gap: 6,
          minHeight: grid ? 38 : 44,
          width: grid ? cellWidth : undefined,
          paddingHorizontal: 10,
          paddingVertical: grid ? 7 : 6,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.field,
          backgroundColor: installed ? colors.sky : pressed ? colors.surfaceSoft : colors.paper,
        },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <View style={[s.row, { gap: 5 }]}>
          {custom && (
            <View
              style={{
                paddingHorizontal: 4,
                paddingVertical: 1,
                borderWidth: 1,
                borderColor: colors.lineStrong,
                borderRadius: 4,
                backgroundColor: colors.surfaceSoft,
              }}
            >
              <Text style={[s.small, { fontSize: 10, lineHeight: 14 }]}>
                {t("agentSpace.addSkillCustomTag")}
              </Text>
            </View>
          )}
          <Text
            numberOfLines={1}
            style={[
              s.text,
              { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, fontWeight: "600" },
            ]}
          >
            {title}
          </Text>
        </View>
        {!grid && (
          <Text numberOfLines={1} style={[s.small, { lineHeight: 15 }]}>
            {description}
          </Text>
        )}
      </View>
      <View style={[s.row, { gap: 6 }]}>
        {/* 桌面端给一个看得见的详情入口；触摸端还可长按整格打开。 */}
        {grid && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("agentSpace.addSkillDetailHint")}
            hitSlop={4}
            onPress={(event) => {
              event.stopPropagation();
              onViewDetail();
            }}
            style={({ pressed }) => ({ padding: 2, opacity: pressed ? 0.6 : 1 })}
          >
            <FileText size={13} color={colors.faint} />
          </Pressable>
        )}
        {installed ? (
          <StatusBadge
            tone="done"
            label={t("agent.skillInstallInstalled")}
            style={{ borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}
          />
        ) : (
          <Plus size={13} color={colors.muted} />
        )}
      </View>
    </Pressable>
  );
}

/**
 * 技能库：内置目录技能 + 用户自建技能合并后，挑技能挂到「当前归属」上。
 *
 * 归属既可以是某个智能体，也可以是一个频道（频道技能由全体成员共享），
 * 所以这里只做展示与点击回调，装 / 卸的具体写入交给调用方。
 * 自建技能跨来源按内容去重后置顶，避免被 180+ 条内置目录淹没；
 * 宽屏排两列、窄屏单列补一行说明；描述不占版面但仍参与搜索。
 */
export function SkillLibraryPanel({
  installedCatalogIds,
  isCustomInstalled,
  onToggleCatalog,
  onToggleCustom,
  onViewCatalogDetail,
  onViewCustomDetail,
}: {
  installedCatalogIds: readonly string[];
  /** 自建技能是否已挂在该归属上（判重逻辑各归属不同，由调用方决定）。 */
  isCustomInstalled: (skill: AgentSkill) => boolean;
  onToggleCatalog: (skill: SkillCatalogEntry, installed: boolean) => void;
  onToggleCustom: (skill: AgentSkill, installed: boolean) => void;
  onViewCatalogDetail: (skill: SkillCatalogEntry) => void;
  onViewCustomDetail: (skill: AgentSkill) => void;
}) {
  const { t, locale } = useTranslation();
  const { skillLibrary } = useAgentSpace();
  const { width: windowWidth } = useWindowDimensions();
  // 三栏布局下列宽远小于窗口宽，用 onLayout 的真实列宽决定单双列。
  const [width, setWidth] = useState(windowWidth);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const zh = locale === "zh-Hans";
  const keyword = query.trim().toLowerCase();
  const matches = (...values: string[]) =>
    !keyword || values.some((value) => value.toLowerCase().includes(keyword));

  // 自建技能来自账户级技能库：创建后即使没有任何 Agent 持有，也能在这里被添加。
  const customEntries: LibraryEntry[] = skillLibrary
    .filter((skill) => matches(skill.name, skill.purpose, skill.instructions, skill.outputFormat))
    .map((skill) => ({
      key: `custom:${skill.id}`,
      title: skill.name,
      description: skill.purpose || skill.instructions,
      installed: isCustomInstalled(skill),
      custom: skill,
    }));
  const catalogEntries: LibraryEntry[] = skillCatalog
    .filter((skill) =>
      matches(skill.titleZh, skill.titleEn, skill.descriptionZh, skill.descriptionEn, skill.id),
    )
    .map((skill) => ({
      key: `catalog:${skill.id}`,
      title: zh ? skill.titleZh : skill.titleEn,
      description: zh ? skill.descriptionZh : skill.descriptionEn,
      installed: installedCatalogIds.includes(skill.id),
      catalog: skill,
    }));
  const filtered = [...customEntries, ...catalogEntries];
  const grid = width >= GRID_MIN_WIDTH;
  const visible = filtered.slice(0, grid ? GRID_PAGE_SIZE : LIST_PAGE_SIZE);
  const hidden = filtered.length - visible.length;
  const cellWidth = grid ? (width - GRID_GAP) / 2 : width;

  return (
    <View style={{ gap: 8 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Text style={[s.small, { lineHeight: 17 }]}>{t("agentSpace.addSkillHint")}</Text>
      <View
        style={[
          s.row,
          {
            gap: 8,
            minHeight: 36,
            paddingHorizontal: 11,
            borderWidth: 1,
            borderColor: focused ? colors.primary : colors.line,
            borderRadius: radius.field,
            backgroundColor: colors.paper,
          },
        ]}
      >
        <Search size={14} strokeWidth={1.7} color={colors.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t("agentSpace.addSkillSearch")}
          placeholderTextColor={colors.faint}
          accessibilityLabel={t("agentSpace.addSkillSearch")}
          style={[
            { flex: 1, minWidth: 0, paddingVertical: 0, color: colors.text, fontSize: 13 },
            // Web 端去掉浏览器默认的黄色 focus 边框（outline），移动端忽略。
            Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : null,
          ]}
        />
      </View>
      {visible.length ? (
        <View style={grid ? { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP } : { gap: 6 }}>
          {visible.map((entry) => (
            <SkillLibraryItem
              key={entry.key}
              title={entry.title}
              description={entry.description}
              installed={entry.installed}
              custom={Boolean(entry.custom)}
              grid={grid}
              cellWidth={cellWidth}
              onToggle={() => {
                if (entry.catalog) onToggleCatalog(entry.catalog, !entry.installed);
                else if (entry.custom) onToggleCustom(entry.custom, !entry.installed);
              }}
              onViewDetail={() => {
                if (entry.catalog) onViewCatalogDetail(entry.catalog);
                else if (entry.custom) onViewCustomDetail(entry.custom);
              }}
            />
          ))}
        </View>
      ) : (
        <Text style={[s.muted, { paddingVertical: 18 }]}>{t("agentSpace.addSkillEmpty")}</Text>
      )}
      {hidden > 0 && (
        <Text style={[s.small, { color: colors.faint }]}>
          {t("agentSpace.addSkillMore", { count: hidden })}
        </Text>
      )}
    </View>
  );
}

/** 已挂载技能卡片上的「移除」：只从当前归属摘掉，不影响技能本身与其它归属。 */
export function SkillRemoveButton({
  skillName,
  onRemove,
}: {
  skillName: string;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("agentSpace.removeSkill")} ${skillName}`}
      hitSlop={6}
      onPress={(event) => {
        event.stopPropagation();
        onRemove();
      }}
      style={({ pressed }) => ({
        height: 24,
        justifyContent: "center",
        paddingHorizontal: 9,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.errorSoft,
        backgroundColor: pressed ? colors.errorSoft : colors.paper,
      })}
    >
      <Text style={[s.small, { color: colors.danger, fontWeight: "600" }]}>
        {t("agentSpace.removeSkill")}
      </Text>
    </Pressable>
  );
}
