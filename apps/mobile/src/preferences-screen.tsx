import { useState } from "react";
import { Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
import type { AgentMemory } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { activeLocaleTag, useTranslation } from "./i18n";
import {
  Check,
  ChevronRight,
  CircleDollarSign,
  Heart,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "./icons";
import { Button, Card, colors, ErrorNotice, Field, fonts, s } from "./ui";
import { useWorkspace } from "./workspace";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function MemoryCard({
  memory,
  editing,
  draft,
  onDraft,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  busy,
  confirming,
  onConfirm,
  onCancelConfirm,
}: {
  memory: AgentMemory;
  editing: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  busy: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
}) {
  const { t } = useTranslation();
  const date = new Date(memory.createdAt);
  return (
    <View
      style={[
        s.card,
        {
          flexGrow: 1,
          flexBasis: 320,
          minHeight: 172,
          padding: 18,
          gap: 11,
          justifyContent: "space-between",
        },
      ]}
    >
      <View style={{ gap: 11 }}>
        <View style={[s.between]}>
          <View style={[s.row, { gap: 7 }]}>
            <Heart size={13} strokeWidth={1.8} color={colors.primary} />
            <Text style={{ fontSize: 10.5, color: colors.muted }}>{t("preferences.type")}</Text>
          </View>
          <Text style={{ fontSize: 10, color: colors.faint }}>
            {Number.isNaN(date.getTime())
              ? memory.createdAt
              : date.toLocaleDateString(activeLocaleTag(), {
                  month: "short",
                  day: "numeric",
                })}
          </Text>
        </View>
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={onDraft}
            multiline
            autoFocus
            accessibilityLabel={t("preferences.editMemory")}
            style={{
              minHeight: 78,
              padding: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.primary,
              color: colors.text,
              fontSize: 14,
              lineHeight: 22,
              textAlignVertical: "top",
              backgroundColor: colors.paper,
            }}
          />
        ) : (
          <Text
            style={{
              fontSize: 16,
              lineHeight: 25,
              color: colors.text,
              fontFamily: fonts.serif,
            }}
          >
            “{memory.text}”
          </Text>
        )}
      </View>
      <View style={[s.between, { paddingTop: 11, borderTopWidth: 1, borderTopColor: colors.line }]}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 10, color: colors.faint }}>
          {memory.source}
        </Text>
        {confirming ? (
          <View style={[s.row, { gap: 6 }]}>
            <Button small danger busy={busy} onPress={onConfirm}>
              {t("preferences.confirmDelete")}
            </Button>
            <Button small onPress={onCancelConfirm}>
              {t("preferences.cancel")}
            </Button>
          </View>
        ) : editing ? (
          <View style={[s.row, { gap: 6 }]}>
            <Button
              small
              primary
              busy={busy}
              disabled={!draft.trim()}
              icon={Check}
              onPress={onSave}
            >
              {t("preferences.save")}
            </Button>
            <Button small icon={X} onPress={onCancel}>
              {t("preferences.cancel")}
            </Button>
          </View>
        ) : (
          <View style={[s.row, { gap: 4 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("preferences.editMemory")}
              onPress={onEdit}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.overlay1 : "transparent",
              })}
            >
              <Pencil size={14} strokeWidth={1.8} color={colors.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("preferences.deleteMemory")}
              onPress={onDelete}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.errorSoft : "transparent",
              })}
            >
              <Trash2 size={14} strokeWidth={1.8} color={colors.muted} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

export function PreferencesScreen() {
  const { data, mutate, error: workspaceError } = useAgentWorkspace();
  const { navigate } = useWorkspace();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [newMemory, setNewMemory] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setNotice(success);
      setTimeout(() => setNotice(""), 1800);
      return true;
    } catch (cause) {
      setError(errorText(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const text = newMemory.trim();
    if (!text) return;
    void run(
      () =>
        mutate("/memories", {
          text,
          source: t("preferences.addedByYou"),
        }),
      t("preferences.savedNotice"),
    ).then((saved) => {
      if (saved) {
        setNewMemory("");
        setAdding(false);
      }
    });
  };

  const saveMemory = (memory: AgentMemory) => {
    const text = draft.trim();
    if (!text) return;
    void run(() => mutate(`/memories/${memory.id}`, { text }), t("preferences.savedNotice")).then(
      (saved) => {
        if (saved) setEditingId(undefined);
      },
    );
  };

  const deleteMemory = (memory: AgentMemory) => {
    void run(
      () => mutate(`/memories/${memory.id}/forget`, {}),
      t("preferences.deletedNotice"),
    ).then((deleted) => {
      if (deleted) setConfirmId(undefined);
    });
  };

  const memories = data?.memories ?? [];

  return (
    <View style={{ gap: 22 }}>
      <View
        style={{
          flexDirection: width >= 760 ? "row" : "column",
          alignItems: width >= 760 ? "center" : "flex-start",
          gap: 20,
          padding: 22,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.sky,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.paper,
          }}
        >
          <Heart size={20} strokeWidth={1.8} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={{ fontSize: 18, lineHeight: 26, fontWeight: "600", color: colors.text }}>
            {t("preferences.heroTitle")}
          </Text>
          <Text style={[s.muted, { lineHeight: 21 }]}>{t("preferences.heroDetail")}</Text>
        </View>
        <Button primary icon={Plus} onPress={() => setAdding((value) => !value)}>
          {t("preferences.addPreference")}
        </Button>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={s.heading}>{t("preferences.portfolioHeading")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("preferences.openPortfolio")}
          onPress={() => navigate("portfolio")}
          style={({ pressed }) => [
            s.card,
            {
              flexDirection: width >= 680 ? "row" : "column",
              alignItems: width >= 680 ? "center" : "flex-start",
              gap: 14,
              padding: 18,
              backgroundColor: pressed ? colors.surface : colors.paper,
            },
          ]}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.sky,
            }}
          >
            <CircleDollarSign size={18} strokeWidth={1.8} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.heading}>{t("app.titlePortfolio")}</Text>
            <Text style={s.small}>{t("preferences.portfolioDetail")}</Text>
          </View>
          <View style={[s.row, { gap: 3 }]}>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {t("preferences.openPortfolio")}
            </Text>
            <ChevronRight size={13} strokeWidth={1.8} color={colors.faint} />
          </View>
        </Pressable>
      </View>

      {adding && (
        <Card style={{ gap: 12, padding: 18 }}>
          <View style={[s.row, { gap: 7 }]}>
            <Plus size={14} strokeWidth={1.8} color={colors.primary} />
            <Text style={s.heading}>{t("preferences.addTitle")}</Text>
          </View>
          <Field
            label={t("preferences.whatToRemember")}
            value={newMemory}
            onChangeText={setNewMemory}
            placeholder={t("preferences.placeholder")}
            multiline
          />
          <View style={[s.row, { justifyContent: "flex-end", gap: 8 }]}>
            <Button onPress={() => setAdding(false)}>{t("preferences.cancel")}</Button>
            <Button primary busy={busy} disabled={!newMemory.trim()} onPress={add}>
              {t("preferences.save")}
            </Button>
          </View>
        </Card>
      )}

      <View style={[s.between]}>
        <Text style={s.heading}>{t("preferences.memoryHeading")}</Text>
        <Text style={s.small}>{t("preferences.count", { count: memories.length })}</Text>
      </View>

      {memories.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {memories.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              editing={editingId === memory.id}
              draft={draft}
              onDraft={setDraft}
              onEdit={() => {
                setEditingId(memory.id);
                setDraft(memory.text);
                setConfirmId(undefined);
              }}
              onCancel={() => setEditingId(undefined)}
              onSave={() => saveMemory(memory)}
              onDelete={() => setConfirmId(memory.id)}
              busy={busy}
              confirming={confirmId === memory.id}
              onConfirm={() => deleteMemory(memory)}
              onCancelConfirm={() => setConfirmId(undefined)}
            />
          ))}
        </View>
      ) : (
        <View style={[s.card, { alignItems: "center", paddingVertical: 42, gap: 10 }]}>
          <Heart size={26} strokeWidth={1.8} color={colors.faint} />
          <Text style={s.heading}>{t("preferences.emptyTitle")}</Text>
          <Text style={[s.muted, { textAlign: "center", maxWidth: 420 }]}>
            {t("preferences.emptyDetail")}
          </Text>
        </View>
      )}

      <View style={[s.row, { gap: 7 }]}>
        <ShieldCheck size={14} strokeWidth={1.8} color={colors.faint} />
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
              borderRadius: 8,
              backgroundColor: colors.green,
            },
          ]}
        >
          <Check size={14} strokeWidth={1.8} color={colors.success} />
          <Text style={{ fontSize: 12, color: colors.success }}>{notice}</Text>
        </View>
      )}
    </View>
  );
}
