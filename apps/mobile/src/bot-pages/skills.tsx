import { useRef, useState } from "react";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";
import { useAgentSpace } from "../agent-space";
import type { AgentSkill } from "../agent-space-model";
import { Text, TextInput } from "../app-text";
import { MySkillDetailSheet, SkillDetailSheet } from "../capability-hub";
import { useTranslation } from "../i18n";
import { Download, Plus, Search } from "../icons";
import { type SkillCatalogEntry, skillCatalog } from "../skill-catalog";
import { StatusBadge } from "../status-badge";
import { Button, colors, Field, radius, s, shadow } from "../ui";
import { BotInlineBack, BotPage, type BotPageProps } from "./shared";

/** 技能库一次渲染的条数，避免把 180+ 条目录一次铺进页面。 */
const LIBRARY_PAGE_SIZE = 40;

function SkillEditor({ skill, onClose }: { skill?: AgentSkill; onClose: () => void }) {
  const { t } = useTranslation();
  const { current, saveSkill } = useAgentSpace();
  const [name, setName] = useState(() => skill?.name ?? t("agentSpace.skillSampleName"));
  const [purpose, setPurpose] = useState(
    () => skill?.purpose ?? t("agentSpace.skillSamplePurpose"),
  );
  const [instructions, setInstructions] = useState(
    () => skill?.instructions ?? t("agentSpace.skillSampleInstructions"),
  );
  const [outputFormat, setOutputFormat] = useState(
    () => skill?.outputFormat ?? t("agentSpace.skillSampleOutput"),
  );
  return (
    <View style={{ gap: 2 }}>
      <Field label={t("agentSpace.skillName")} value={name} onChangeText={setName} maxLength={40} />
      <Field
        label={t("agentSpace.skillPurpose")}
        value={purpose}
        onChangeText={setPurpose}
        maxLength={120}
      />
      <Field
        label={t("agentSpace.skillInstructions")}
        value={instructions}
        onChangeText={setInstructions}
        maxLength={4000}
        multiline
      />
      <Field
        label={t("agentSpace.skillOutput")}
        value={outputFormat}
        onChangeText={setOutputFormat}
        maxLength={800}
        multiline
      />
      <Button
        primary
        disabled={!name.trim() || !instructions.trim()}
        onPress={() => {
          saveSkill(current.id, { name, purpose, instructions, outputFormat }, skill?.id);
          onClose();
        }}
      >
        {t("agentSpace.saveSkill")}
      </Button>
    </View>
  );
}

/**
 * 技能库：从技能目录里挑技能安装到当前 Agent。
 *
 * 以「已安装」徽标区分状态，行内再次点击即移除，不额外弹确认层。
 */
function SkillLibraryPanel() {
  const { t, locale } = useTranslation();
  const { current, setSkillInstalled } = useAgentSpace();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const zh = locale === "zh-Hans";
  const keyword = query.trim().toLowerCase();
  const matches = (...values: string[]) =>
    !keyword || values.some((value) => value.toLowerCase().includes(keyword));
  const filtered = skillCatalog.filter((skill) =>
    matches(skill.titleZh, skill.titleEn, skill.descriptionZh, skill.descriptionEn, skill.id),
  );
  const visible = filtered.slice(0, LIBRARY_PAGE_SIZE);
  const hidden = filtered.length - visible.length;

  return (
    <View style={{ gap: 10 }}>
      <Text style={s.muted}>{t("agentSpace.addSkillHint")}</Text>
      <View
        style={[
          s.row,
          {
            gap: 8,
            minHeight: 40,
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
          style={{ flex: 1, minWidth: 0, paddingVertical: 0, color: colors.text, fontSize: 13 }}
        />
      </View>
      {visible.length ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.field,
            overflow: "hidden",
          }}
        >
          {visible.map((skill, index) => {
            const installed = current.installedSkills.includes(skill.id);
            const title = zh ? skill.titleZh : skill.titleEn;
            return (
              <Pressable
                key={skill.id}
                accessibilityRole="checkbox"
                accessibilityLabel={title}
                accessibilityState={{ checked: installed }}
                onPress={() => setSkillInstalled(current.id, skill.id, !installed)}
                style={({ pressed }) => [
                  s.row,
                  {
                    gap: 10,
                    minHeight: 56,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.line,
                    backgroundColor: installed
                      ? colors.sky
                      : pressed
                        ? colors.surfaceSoft
                        : colors.paper,
                  },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text numberOfLines={1} style={[s.text, { fontWeight: "600" }]}>
                    {title}
                  </Text>
                  <Text numberOfLines={2} style={s.small}>
                    {zh ? skill.descriptionZh : skill.descriptionEn}
                  </Text>
                </View>
                {installed ? (
                  <StatusBadge
                    tone="done"
                    label={t("agent.skillInstallInstalled")}
                    style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}
                  />
                ) : (
                  <Plus size={16} color={colors.muted} />
                )}
              </Pressable>
            );
          })}
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

/** 「+」按钮的锚点：用窗口坐标把菜单贴在按钮下方，避免被滚动的页面裁掉。 */
type SkillMenuAnchor = { x: number; y: number; width: number; height: number };

function SkillMenuRow({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof Plus;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        minHeight: 36,
        paddingHorizontal: 10,
        borderRadius: radius.control,
        backgroundColor: pressed ? colors.overlay1 : "transparent",
      })}
    >
      <Icon size={15} color={colors.muted} />
      <Text style={[s.text, { fontSize: 13 }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * 「+」按钮的操作菜单：创建技能 / 从技能库添加技能。
 *
 * 用透明 Modal 承载，点空白处即关闭，与 Agent 列表的「更多」菜单手感一致。
 */
function SkillActionMenu({
  anchor,
  onCreate,
  onAdd,
  onClose,
}: {
  anchor: SkillMenuAnchor;
  onCreate: () => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const menuWidth = Math.min(180, width - 24);
  const menuHeight = 4 * 2 + 36 * 2 + 1;
  // 默认贴按钮右下方展开；底部空间不够就翻到上方。
  const left = Math.max(12, Math.min(anchor.x + anchor.width - menuWidth, width - menuWidth - 12));
  const below = anchor.y + anchor.height + 6;
  const top = below + menuHeight > height - 12 ? Math.max(12, anchor.y - menuHeight - 6) : below;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ui.closeDetails")}
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <View
          style={{
            position: "absolute",
            top,
            left,
            width: menuWidth,
            padding: 4,
            gap: 1,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.card,
            backgroundColor: colors.paper,
            ...shadow.sheet,
          }}
        >
          <SkillMenuRow icon={Plus} label={t("agentSpace.createSkill")} onPress={onCreate} />
          <SkillMenuRow icon={Download} label={t("agentSpace.addSkill")} onPress={onAdd} />
        </View>
      </View>
    </Modal>
  );
}

export function BotSkillsPage({ onClose, embedded }: BotPageProps) {
  const { t, locale } = useTranslation();
  const { current, deleteSkill } = useAgentSpace();
  const [editingSkill, setEditingSkill] = useState<AgentSkill | "new">();
  const [adding, setAdding] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<SkillMenuAnchor>();
  /** 自建技能详情：与「应用与能力 → 我的技能」共用同一版式。 */
  const [viewingCustom, setViewingCustom] = useState<AgentSkill>();
  /** 技能库技能详情：与「应用与能力 → 技能」共用同一版式。 */
  const [viewingCatalog, setViewingCatalog] = useState<SkillCatalogEntry>();
  const addButtonRef = useRef<View>(null);
  const zh = locale === "zh-Hans";
  const installedEntries = current.installedSkills
    .map((id) => skillCatalog.find((skill) => skill.id === id))
    .filter((skill): skill is (typeof skillCatalog)[number] => Boolean(skill));

  const openMenu = () => {
    addButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
    });
  };

  if (editingSkill)
    return (
      <BotPage
        title={t(editingSkill === "new" ? "agentSpace.createSkill" : "agentSpace.editSkill")}
        onClose={() => setEditingSkill(undefined)}
        embedded={embedded}
      >
        {embedded && (
          <BotInlineBack label={t("common.back")} onPress={() => setEditingSkill(undefined)} />
        )}
        <SkillEditor
          skill={editingSkill === "new" ? undefined : editingSkill}
          onClose={() => setEditingSkill(undefined)}
        />
      </BotPage>
    );
  if (adding)
    return (
      <BotPage title={t("agentSpace.addSkill")} onClose={onClose} embedded={embedded}>
        {embedded && <BotInlineBack label={t("common.back")} onPress={() => setAdding(false)} />}
        <SkillLibraryPanel />
      </BotPage>
    );
  return (
    <BotPage title={t("agentSpace.skills")} onClose={onClose} embedded={embedded}>
      <View style={{ gap: 8 }}>
        <View style={[s.between, { marginBottom: 5 }]}>
          <Text style={s.heading}>{t("agentSpace.mySkills")}</Text>
          <View ref={addButtonRef} collapsable={false}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("agentSpace.skillMenuLabel")}
              accessibilityState={{ expanded: !!menuAnchor }}
              onPress={openMenu}
              style={({ pressed }) => ({
                width: 30,
                height: 30,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.control,
                backgroundColor: pressed ? colors.surface : colors.paper,
              })}
            >
              <Plus size={16} color={colors.text} />
            </Pressable>
          </View>
        </View>
        {current.customSkills.length || installedEntries.length ? (
          <>
            {current.customSkills.map((skill) => (
              <Pressable
                key={skill.id}
                accessibilityRole="button"
                accessibilityLabel={skill.name}
                onPress={() => setViewingCustom(skill)}
                style={({ pressed }) => ({
                  padding: 14,
                  borderRadius: 15,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: pressed ? colors.surface : colors.paper,
                  gap: 7,
                })}
              >
                <View style={s.between}>
                  <Text style={[s.text, { flex: 1, minWidth: 0, fontWeight: "600" }]}>
                    {skill.name}
                  </Text>
                  {/* 用户自建的技能不再提供启停开关，右侧直接给出删除入口。 */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("agentSpace.deleteSkill")} ${skill.name}`}
                    hitSlop={6}
                    onPress={(event) => {
                      event.stopPropagation();
                      deleteSkill(current.id, skill.id);
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
                      {t("agentSpace.deleteSkill")}
                    </Text>
                  </Pressable>
                </View>
                <Text style={s.small}>{skill.purpose || t("agentSpace.skillInstructions")}</Text>
              </Pressable>
            ))}
            {/* 从技能库安装的技能与自建技能同列展示，点击同样打开详情。 */}
            {installedEntries.map((skill) => {
              const title = zh ? skill.titleZh : skill.titleEn;
              return (
                <Pressable
                  key={skill.id}
                  accessibilityRole="button"
                  accessibilityLabel={title}
                  onPress={() => setViewingCatalog(skill)}
                  style={({ pressed }) => ({
                    padding: 14,
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: pressed ? colors.surface : colors.paper,
                    gap: 7,
                  })}
                >
                  <View style={s.between}>
                    <Text
                      numberOfLines={1}
                      style={[s.text, { flex: 1, minWidth: 0, fontWeight: "600" }]}
                    >
                      {title}
                    </Text>
                  </View>
                  <Text numberOfLines={2} style={s.small}>
                    {zh ? skill.descriptionZh : skill.descriptionEn}
                  </Text>
                </Pressable>
              );
            })}
          </>
        ) : (
          <Text style={[s.muted, { paddingVertical: 18 }]}>{t("agentSpace.skillEmpty")}</Text>
        )}
      </View>
      {viewingCustom && (
        <MySkillDetailSheet
          title={viewingCustom.name}
          skill={viewingCustom}
          onClose={() => setViewingCustom(undefined)}
          footer={
            <Button
              primary
              onPress={() => {
                const target = viewingCustom;
                setViewingCustom(undefined);
                setEditingSkill(target);
              }}
            >
              {t("agentSpace.editSkill")}
            </Button>
          }
        />
      )}
      {viewingCatalog && (
        <SkillDetailSheet skill={viewingCatalog} onClose={() => setViewingCatalog(undefined)} />
      )}
      {menuAnchor && (
        <SkillActionMenu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(undefined)}
          onCreate={() => {
            setMenuAnchor(undefined);
            setEditingSkill("new");
          }}
          onAdd={() => {
            setMenuAnchor(undefined);
            setAdding(true);
          }}
        />
      )}
    </BotPage>
  );
}
