import { useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import {
  type AgentMemory,
  DEFAULT_MEMORY_CATEGORY,
  MEMORY_CATEGORIES,
  type MemoryCategory,
} from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { activeLocaleTag, type TranslationKey, useTranslation } from "./i18n";
import {
  Activity,
  Check,
  FileText,
  Heart,
  type IconComponent,
  Pencil,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
} from "./icons";
import { breakpoints, colors, fonts } from "./theme";
import { Button, ErrorNotice, Field, Sheet, s } from "./ui";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const CATEGORY_META: Record<MemoryCategory, { icon: IconComponent; label: TranslationKey }> = {
  投资目标: { icon: Target, label: "preferences.categoryGoal" },
  风险偏好: { icon: ShieldCheck, label: "preferences.categoryRisk" },
  关注领域: { icon: Activity, label: "preferences.categoryFocus" },
  分析习惯: { icon: FileText, label: "preferences.categoryHabit" },
};

function categoryOf(memory: AgentMemory): MemoryCategory {
  return memory.category && MEMORY_CATEGORIES.includes(memory.category)
    ? memory.category
    : "关注领域";
}

function memoryDate(memory: AgentMemory) {
  const date = new Date(memory.createdAt);
  return Number.isNaN(date.getTime())
    ? memory.createdAt
    : new Intl.DateTimeFormat(activeLocaleTag(), {
        month: "short",
        day: "numeric",
      }).format(date);
}

function MemoryCard({
  memory,
  onEdit,
  onDelete,
  busy,
  confirming,
  onConfirm,
  onCancelConfirm,
}: {
  memory: AgentMemory;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
}) {
  const { t } = useTranslation();
  const category = categoryOf(memory);
  const meta = CATEGORY_META[category];
  const CategoryIcon = meta.icon;

  return (
    <View
      style={[
        s.card,
        {
          flexGrow: 1,
          minHeight: 166,
          padding: 18,
          gap: 16,
          justifyContent: "space-between",
        },
      ]}
    >
      <View style={{ gap: 13 }}>
        <View style={[s.between, { gap: 12 }]}>
          <View style={[s.row, { gap: 8, flex: 1 }]}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.surface,
              }}
            >
              <CategoryIcon size={16} color={colors.muted} />
            </View>
            <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
              {t(meta.label)}
            </Text>
          </View>
          {!confirming && (
            <View style={[s.row, { gap: 2 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("preferences.editMemory")}
                onPress={onEdit}
                style={({ pressed }) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 7,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? colors.overlay1 : "transparent",
                })}
              >
                <Pencil size={14} color={colors.muted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("preferences.deleteMemory")}
                onPress={onDelete}
                style={({ pressed }) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 7,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? colors.errorSoft : "transparent",
                })}
              >
                <Trash2 size={14} color={colors.muted} />
              </Pressable>
            </View>
          )}
        </View>
        <Text
          style={{
            fontSize: 16,
            lineHeight: 26,
            color: colors.text,
            fontFamily: fonts.serif,
          }}
        >
          {memory.text}
        </Text>
      </View>

      {confirming ? (
        <View
          style={[
            s.between,
            {
              gap: 12,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: colors.line,
            },
          ]}
        >
          <Text style={[s.small, { flex: 1 }]}>{t("preferences.deleteConfirmDetail")}</Text>
          <View style={[s.row, { gap: 6 }]}>
            <Button small danger busy={busy} onPress={onConfirm}>
              {t("preferences.confirmDelete")}
            </Button>
            <Button small onPress={onCancelConfirm}>
              {t("preferences.cancel")}
            </Button>
          </View>
        </View>
      ) : (
        <Text style={[s.small, { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }]}>
          {t("preferences.toldOn", { date: memoryDate(memory) })}
        </Text>
      )}
    </View>
  );
}

function MemoryEditorSheet({
  memory,
  onClose,
  onSubmit,
}: {
  memory?: AgentMemory;
  onClose: () => void;
  onSubmit: (value: { text: string; category: MemoryCategory }) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(memory?.text ?? "");
  const [category, setCategory] = useState<MemoryCategory>(
    memory ? categoryOf(memory) : DEFAULT_MEMORY_CATEGORY,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (await onSubmit({ text: text.trim(), category })) onClose();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={memory ? t("preferences.editTitle") : t("preferences.addTitle")}
      subtitle={memory ? t("preferences.editSubtitle") : t("preferences.addSubtitle")}
      onClose={onClose}
      narrow
    >
      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
            {t("preferences.categoryLabel")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {MEMORY_CATEGORIES.map((item) => {
              const ItemIcon = CATEGORY_META[item].icon;
              const active = item === category;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setCategory(item)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    minWidth: 132,
                    flexGrow: 1,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.line,
                    backgroundColor: active ? colors.sky : pressed ? colors.overlay1 : colors.paper,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  })}
                >
                  <ItemIcon size={16} color={active ? colors.primary : colors.muted} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: active ? colors.primaryStrong : colors.text,
                    }}
                  >
                    {t(CATEGORY_META[item].label)}
                  </Text>
                  {active && <Check size={14} color={colors.primary} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        <Field
          label={t("preferences.whatToRemember")}
          value={text}
          onChangeText={setText}
          placeholder={t("preferences.placeholder")}
          multiline
          maxLength={4000}
          autoFocus
        />
        <Text style={[s.small, { marginTop: -12, textAlign: "right" }]}>
          {t("preferences.characterCount", { count: text.length })}
        </Text>
        <ErrorNotice error={error} />
        <View style={[s.row, { justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }]}>
          <Button onPress={onClose}>{t("preferences.cancel")}</Button>
          <Button primary busy={busy} disabled={!text.trim()} onPress={() => void save()}>
            {t("preferences.save")}
          </Button>
        </View>
      </View>
    </Sheet>
  );
}

export function PreferencesScreen() {
  const { data, mutate, error: workspaceError } = useAgentWorkspace();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [editor, setEditor] = useState<{ memory?: AgentMemory }>();
  const [confirmId, setConfirmId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = async (action: () => Promise<unknown>, success: string, rethrow = false) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setNotice(success);
      setTimeout(() => setNotice(""), 1800);
      return true;
    } catch (cause) {
      setError(errorText(cause));
      if (rethrow) throw cause;
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveMemory = async (
    memory: AgentMemory | undefined,
    value: { text: string; category: MemoryCategory },
  ) =>
    run(
      () =>
        mutate(
          memory ? `/memories/${memory.id}` : "/memories",
          memory
            ? value
            : {
                ...value,
                source: t("preferences.addedByYou"),
              },
        ),
      t("preferences.savedNotice"),
      true,
    );

  const deleteMemory = (memory: AgentMemory) => {
    void run(
      () => mutate(`/memories/${memory.id}/forget`, {}),
      t("preferences.deletedNotice"),
    ).then((deleted) => {
      if (deleted) setConfirmId(undefined);
    });
  };

  const memories = data?.memories ?? [];
  const columns = width >= breakpoints.desktop ? 2 : 1;

  return (
    <View style={{ gap: 22 }}>
      <View
        style={{
          flexDirection: width >= 760 ? "row" : "column",
          alignItems: width >= 760 ? "center" : "flex-start",
          gap: 20,
        }}
      >
        <View style={{ flex: 1, gap: 7 }}>
          <Text
            style={{
              fontSize: width >= 760 ? 28 : 24,
              lineHeight: width >= 760 ? 39 : 34,
              color: colors.heading,
              fontFamily: fonts.serif,
              fontWeight: "600",
            }}
          >
            {t("preferences.heroTitle")}
          </Text>
          <Text style={[s.muted, { lineHeight: 22 }]}>{t("preferences.heroDetail")}</Text>
        </View>
        <Button
          primary
          icon={Plus}
          onPress={() => {
            setConfirmId(undefined);
            setEditor({});
          }}
        >
          {t("preferences.addPreference")}
        </Button>
      </View>

      <View
        style={[
          s.row,
          {
            alignItems: "flex-start",
            gap: 12,
            padding: 16,
            borderRadius: 10,
            backgroundColor: colors.surfaceSoft,
          },
        ]}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.paper,
          }}
        >
          <Heart size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[s.text, { fontWeight: "600" }]}>{t("preferences.contextTitle")}</Text>
          <Text style={[s.small, { lineHeight: 20 }]}>{t("preferences.contextDetail")}</Text>
        </View>
      </View>

      <View style={s.between}>
        <Text style={s.heading}>{t("preferences.memoryHeading")}</Text>
        <Text style={s.small}>{t("preferences.count", { count: memories.length })}</Text>
      </View>

      {memories.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {memories.map((memory) => (
            <View key={memory.id} style={{ width: columns === 2 ? "48.8%" : "100%" }}>
              <MemoryCard
                memory={memory}
                onEdit={() => {
                  setConfirmId(undefined);
                  setEditor({ memory });
                }}
                onDelete={() => setConfirmId(memory.id)}
                busy={busy}
                confirming={confirmId === memory.id}
                onConfirm={() => deleteMemory(memory)}
                onCancelConfirm={() => setConfirmId(undefined)}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={[s.card, { alignItems: "center", paddingVertical: 42, gap: 10 }]}>
          <Heart size={26} color={colors.faint} />
          <Text style={s.heading}>{t("preferences.emptyTitle")}</Text>
          <Text style={[s.muted, { textAlign: "center", maxWidth: 420 }]}>
            {t("preferences.emptyDetail")}
          </Text>
          <Button primary icon={Plus} onPress={() => setEditor({})}>
            {t("preferences.addPreference")}
          </Button>
        </View>
      )}

      <View style={[s.row, { gap: 7 }]}>
        <ShieldCheck size={14} color={colors.faint} />
        <Text style={[s.small, { flex: 1 }]}>{t("preferences.privacy")}</Text>
      </View>
      <ErrorNotice error={error || workspaceError} />
      {!!notice && (
        <View
          style={[
            s.row,
            {
              alignSelf: "flex-start",
              gap: 7,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 7,
              backgroundColor: colors.green,
            },
          ]}
        >
          <Check size={14} color={colors.success} />
          <Text style={{ fontSize: 12, color: colors.success }}>{notice}</Text>
        </View>
      )}

      {editor && (
        <MemoryEditorSheet
          memory={editor.memory}
          onClose={() => setEditor(undefined)}
          onSubmit={(value) => saveMemory(editor.memory, value)}
        />
      )}
    </View>
  );
}
