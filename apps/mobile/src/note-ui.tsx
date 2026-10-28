/**
 * 笔记与论点共用 UI：类型/状态 Chip、笔记卡、编辑器、详情、检验记录、确认状态、
 * 标的详情内嵌笔记区。
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";
import type { LingWuApi } from "./api";
import { type TranslationFn, useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CircleX,
  Clock3,
  FileText,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Target,
  Trash2,
} from "./icons";
import { metaFor, type SymbolMeta, searchSymbols } from "./market";
import {
  createNote,
  deleteNote,
  type InvestmentNote,
  loadNoteChecks,
  loadNotes,
  NOTE_TYPES,
  type NoteCheck,
  type NoteCheckEntry,
  type NoteType,
  type ThesisStatus,
  updateNote,
  useNotesState,
} from "./notes";
import { Button, Chip, colors, DisclaimerNote, ErrorNotice, Sheet, s } from "./ui";
import { useWorkspace } from "./workspace";

const TYPE_LABEL: Record<NoteType, TranslationKey> = {
  BUY_REASON: "notes.typeBuy",
  SELL_REASON: "notes.typeSell",
  RESEARCH: "notes.typeResearch",
  THESIS: "notes.typeThesis",
};

const TYPE_ICON: Record<NoteType, typeof FileText> = {
  BUY_REASON: ArrowDownToLine,
  SELL_REASON: ArrowUpRight,
  RESEARCH: FileText,
  THESIS: Target,
};

const STATUS_LABEL: Record<ThesisStatus, TranslationKey> = {
  ACTIVE: "notes.statusPending",
  VALIDATED: "notes.statusValid",
  INVALIDATED: "notes.statusInvalid",
  EXPIRED: "notes.statusExpired",
};

const STATUS_COLOR: Record<ThesisStatus, { text: string; background: string; icon: typeof Check }> =
  {
    VALIDATED: { text: colors.success, background: colors.green, icon: Check },
    ACTIVE: {
      text: colors.alertVolumeText,
      background: colors.alertVolumeSurface,
      icon: Clock3,
    },
    INVALIDATED: { text: colors.danger, background: colors.errorSoft, icon: CircleX },
    EXPIRED: { text: colors.faint, background: colors.surface, icon: Archive },
  };

export function noteTypeLabelKey(type: NoteType) {
  return TYPE_LABEL[type];
}

export function NoteTypeChip({ type }: { type: NoteType }) {
  const { t } = useTranslation();
  const Icon = TYPE_ICON[type];
  return (
    <View
      style={[
        s.row,
        s.chip,
        { gap: 4, backgroundColor: colors.surface, minHeight: 22, paddingVertical: 2 },
      ]}
    >
      <Icon size={11} color={colors.text} />
      <Text style={[s.chipText, { color: colors.text }]}>{t(TYPE_LABEL[type])}</Text>
    </View>
  );
}

export function ThesisStatusChip({ status }: { status?: ThesisStatus }) {
  const { t } = useTranslation();
  if (!status) return null;
  const config = STATUS_COLOR[status];
  const Icon = config.icon;
  return (
    <View
      style={[
        s.row,
        {
          gap: 4,
          paddingHorizontal: 8,
          minHeight: 22,
          borderRadius: 999,
          backgroundColor: config.background,
        },
      ]}
    >
      <Icon size={11} strokeWidth={1.9} color={config.text} />
      <Text style={{ fontSize: 11, fontWeight: "600", color: config.text }}>
        {t(STATUS_LABEL[status])}
      </Text>
    </View>
  );
}

export function ThesisCheckChip({ note }: { note: InvestmentNote }) {
  const { t } = useTranslation();
  if (note.check?.outcome !== "pending_confirmation") return null;
  return (
    <View
      style={[
        s.row,
        {
          gap: 4,
          paddingHorizontal: 8,
          minHeight: 22,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.alertVolume,
        },
      ]}
    >
      <AlertTriangle size={11} strokeWidth={1.9} color={colors.alertVolumeText} />
      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.alertVolumeText }}>
        {t("notes.checkPendingConfirm")}
      </Text>
    </View>
  );
}

export function checkEntrySummary(check: NoteCheck, t: TranslationFn) {
  if (check.outcome === "pending_confirmation") return t("notes.checkPendingDetail");
  if (check.outcome === "inconclusive") return t("notes.checkInconclusive");
  if (check.source === "manual") return t("notes.checkManual");
  const suggestion = t(check.outcome === "valid" ? "notes.suggestValid" : "notes.suggestInvalid");
  return `${suggestion} · ${t("notes.checkAuto")}`;
}

export function checkSummary(note: InvestmentNote, t: TranslationFn) {
  const check = note.check;
  if (!check) return t("notes.neverChecked");
  return checkEntrySummary(check, t);
}

/** 检验行完整文案：最近检验 + 来源/建议，避免「人工确认」重复出现。 */
export function noteCheckLine(note: InvestmentNote, t: TranslationFn) {
  const check = note.check;
  if (!check) return t("notes.neverChecked");
  const date = new Date(check.checkedAt).toLocaleDateString();
  if (check.outcome === "pending_confirmation")
    return `${t("notes.lastChecked", { time: date, source: t("notes.checkAuto") })} · ${t("notes.checkPendingDetail")}`;
  // 人工确认优先：EXPIRED 等手动状态的 outcome 可能是 inconclusive，不能显示成「证据不足」。
  if (check.source === "manual")
    return `${t("notes.lastChecked", { time: date, source: t("notes.checkManual") })}`;
  if (check.outcome === "inconclusive")
    return `${t("notes.lastChecked", { time: date, source: t("notes.checkAuto") })} · ${t("notes.checkInconclusive")}`;
  return `${t("notes.lastChecked", { time: date, source: t("notes.checkAuto") })} · ${t(
    check.outcome === "valid" ? "notes.suggestValid" : "notes.suggestInvalid",
  )}`;
}

export function NoteCard({
  note,
  onPress,
  compact,
}: {
  note: InvestmentNote;
  onPress: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const symbolName = metaFor(note.symbolCode).name;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t(TYPE_LABEL[note.type])}, ${note.symbolCode}, ${(note.title ?? note.content).slice(0, 40)}, ${new Date(note.createdAt).toLocaleDateString()}`}
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        { padding: 14, gap: 6 },
        pressed && { backgroundColor: colors.overlay1 },
      ]}
    >
      <View style={[s.between, { gap: 8 }]}>
        <View style={[s.row, { gap: 6, flexWrap: "wrap", flex: 1 }]}>
          <NoteTypeChip type={note.type} />
          <Chip>{note.symbolCode}</Chip>
          {note.type === "THESIS" && <ThesisStatusChip status={note.status} />}
          {note.type === "THESIS" && <ThesisCheckChip note={note} />}
        </View>
        <Text style={[s.small, s.metric, { color: colors.faint }]}>
          {new Date(note.createdAt).toLocaleDateString()}{" "}
          {new Date(note.createdAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
      <Text style={[s.muted, { fontSize: 12 }]} numberOfLines={1}>
        {symbolName}
      </Text>
      {!!note.title && (
        <Text style={[s.text, { fontSize: 14, fontWeight: "600" }]} numberOfLines={1}>
          {note.title}
        </Text>
      )}
      <Text
        style={[s.text, { fontSize: 14, lineHeight: 21 }]}
        numberOfLines={note.title ? 1 : compact ? 1 : 2}
      >
        {note.content}
      </Text>
      {note.type === "THESIS" && (
        <Text
          style={[
            s.small,
            {
              color:
                note.check?.outcome === "pending_confirmation"
                  ? colors.alertVolumeText
                  : colors.faint,
            },
          ]}
          numberOfLines={1}
        >
          {noteCheckLine(note, t)}
        </Text>
      )}
    </Pressable>
  );
}

function SymbolPicker({
  value,
  onChange,
  api,
  error,
}: {
  value?: SymbolMeta;
  onChange: (symbol?: SymbolMeta) => void;
  api: LingWuApi;
  error?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolMeta[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchSymbols(api, trimmed, 5).then(setResults);
    }, 300);
    return () => clearTimeout(timer);
  }, [api, query]);

  if (value) {
    return (
      <View
        style={[
          s.row,
          {
            gap: 8,
            minHeight: 44,
            paddingHorizontal: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.line,
          },
        ]}
      >
        <Text style={[s.text, { flex: 1 }]}>
          {value.code} · {value.name}
        </Text>
        <Button small style={{ minHeight: 36 }} onPress={() => onChange(undefined)}>
          {t("notes.changeSymbol")}
        </Button>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <View
        style={[
          s.row,
          {
            gap: 8,
            minHeight: 44,
            paddingHorizontal: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.line,
          },
        ]}
      >
        <Search size={17} color={colors.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("notes.selectSymbol")}
          placeholderTextColor={colors.faint}
          accessibilityLabel={t("notes.selectSymbol")}
          style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 8 }}
        />
      </View>
      {!!query.trim() && (
        <View
          style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 10, overflow: "hidden" }}
        >
          {results.length ? (
            results.map((result, index) => (
              <Pressable
                key={result.code}
                accessibilityRole="button"
                onPress={() => {
                  onChange(result);
                  setQuery("");
                }}
                style={[
                  s.row,
                  {
                    gap: 10,
                    minHeight: 44,
                    paddingHorizontal: 12,
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: colors.line,
                  },
                ]}
              >
                <Text style={[s.text, { width: 94, fontSize: 14, fontWeight: "600" }]}>
                  {result.code}
                </Text>
                <Text style={[s.muted, { flex: 1 }]} numberOfLines={1}>
                  {result.name}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={[s.muted, { padding: 12 }]}>{t("portfolio.symbolSearchEmpty")}</Text>
          )}
        </View>
      )}
    </View>
  );
}

export function NoteEditorSheet({
  api,
  initial,
  defaultType = "RESEARCH",
  defaultSymbol,
  onClose,
  onSaved,
}: {
  api: LingWuApi;
  initial?: InvestmentNote;
  defaultType?: NoteType;
  defaultSymbol?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<NoteType>(initial?.type ?? defaultType);
  const [symbol, setSymbol] = useState<SymbolMeta | undefined>(
    initial ? metaFor(initial.symbolCode) : defaultSymbol ? metaFor(defaultSymbol) : undefined,
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty =
    content !== (initial?.content ?? "") ||
    title !== (initial?.title ?? "") ||
    (!initial && !!symbol);
  const contentError = !content.trim()
    ? t("notes.contentRequired")
    : type === "THESIS" && content.trim().length < 10
      ? t("notes.thesisMinLength")
      : content.length > 2000
        ? t("notes.contentCounter", { count: 2000 })
        : "";
  const symbolError = !symbol ? t("notes.symbolRequired") : "";
  const canSave = !contentError && !symbolError && !busy;

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  return (
    <Sheet title={t(initial ? "notes.editNote" : "notes.writeNote")} onClose={requestClose}>
      <Text style={[s.small, { fontWeight: "600", color: colors.text, marginBottom: 7 }]}>
        {t("notes.titleLabel")}
      </Text>
      <TextInput
        value={title}
        onChangeText={(text) => setTitle(text.slice(0, 80))}
        placeholder={t("notes.titlePlaceholder")}
        placeholderTextColor={colors.faint}
        accessibilityLabel={t("notes.titleLabel")}
        style={[s.input, { marginBottom: 4 }]}
      />
      <Text
        style={[s.small, s.metric, { color: colors.faint, textAlign: "right", marginBottom: 12 }]}
      >
        {t("notes.titleCounter", { count: title.length })}
      </Text>
      <Text style={[s.small, { fontWeight: "600", color: colors.text, marginBottom: 8 }]}>
        {t("notes.contentLabel")}
      </Text>
      {!initial && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {NOTE_TYPES.map((option) => {
            const selected = type === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setType(option)}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.line,
                  backgroundColor: selected ? colors.sky : colors.paper,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: selected ? colors.primary : colors.muted,
                  }}
                >
                  {t(TYPE_LABEL[option])}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={[s.small, { fontWeight: "600", color: colors.text, marginBottom: 7 }]}>
        {t("notes.filterBySymbol")} *
      </Text>
      {initial ? (
        <View style={{ marginBottom: 14 }}>
          <Chip>
            {initial.symbolCode} · {metaFor(initial.symbolCode).name}
          </Chip>
        </View>
      ) : (
        <View style={{ marginBottom: 14 }}>
          <SymbolPicker
            api={api}
            value={symbol}
            onChange={(next) => setSymbol(next)}
            error={symbolError}
          />
          {!!symbolError && (
            <Text
              accessibilityRole="alert"
              style={[s.small, { color: colors.danger, marginTop: 4 }]}
            >
              {symbolError}
            </Text>
          )}
        </View>
      )}

      <TextInput
        value={content}
        onChangeText={(text) => setContent(text.slice(0, 2000))}
        multiline
        placeholder={t("notes.contentPlaceholder")}
        placeholderTextColor={colors.faint}
        accessibilityLabel={t("notes.contentLabel")}
        style={[
          s.input,
          { minHeight: 140, textAlignVertical: "top", paddingTop: 10 },
          contentError && content.length > 0 && { borderColor: colors.danger },
        ]}
      />
      <View style={[s.between, { marginTop: 4 }]}>
        <Text accessibilityRole="alert" style={[s.small, { color: colors.danger }]}>
          {content.length > 0 ? contentError : ""}
        </Text>
        <Text style={[s.small, s.metric, { color: colors.faint }]}>
          {t("notes.contentCounter", { count: content.length })}
        </Text>
      </View>
      {type === "THESIS" && (
        <Text style={[s.small, { marginTop: 8 }]}>{t("notes.thesisHint")}</Text>
      )}
      <ErrorNotice error={error} />
      <View style={[s.row, { gap: 10, marginTop: 16, flexWrap: "wrap" }]}>
        <Button
          primary
          busy={busy}
          disabled={!canSave}
          style={{ minHeight: 44 }}
          onPress={() => {
            if (!symbol || !canSave) return;
            void (async () => {
              setBusy(true);
              setError("");
              try {
                if (initial) {
                  await updateNote(api, initial.id, {
                    title: title.trim(),
                    content: content.trim(),
                  });
                } else {
                  await createNote(api, {
                    symbolCode: symbol.code,
                    type,
                    title: title.trim() || undefined,
                    content: content.trim(),
                    status: type === "THESIS" ? "ACTIVE" : undefined,
                  });
                }
                onSaved();
              } catch {
                setError(t("notes.saveError"));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {t("notes.saveNote")}
        </Button>
        <Button style={{ minHeight: 44 }} onPress={requestClose}>
          {t("notes.cancel")}
        </Button>
      </View>

      {confirmDiscard && (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setConfirmDiscard(false)}
        >
          <Pressable onPress={() => setConfirmDiscard(false)} style={s.modalShade}>
            <Pressable
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={[s.card, { maxWidth: 360, width: "100%", padding: 22, gap: 10 }]}
            >
              <Text style={s.heading}>{t("notes.discardTitle")}</Text>
              <View style={[s.row, { gap: 10, marginTop: 8 }]}>
                <Button style={{ flex: 1, minHeight: 44 }} onPress={() => setConfirmDiscard(false)}>
                  {t("notes.discardContinue")}
                </Button>
                <Button danger style={{ flex: 1, minHeight: 44 }} onPress={onClose}>
                  {t("notes.discardConfirm")}
                </Button>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Sheet>
  );
}

export function CheckHistorySheet({
  api,
  note,
  onClose,
}: {
  api: LingWuApi;
  note: InvestmentNote;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<NoteCheckEntry[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void loadNoteChecks(api, note)
      .then((list) => {
        if (cancelled) return;
        setEntries(list);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // 接口失败时保留最近一次检验，避免时间线整块消失。
        setEntries(note.check ? [{ ...note.check, week: "", status: "ok" }] : []);
        setError(t("notes.checkHistoryError"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, note, attempt, t]);

  return (
    <Sheet title={t("notes.historyTitle", { symbol: note.symbolCode })} onClose={onClose}>
      {loading ? (
        <View style={[s.row, { gap: 8, paddingVertical: 12 }]}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={s.muted}>{t("notes.checkHistoryLoading")}</Text>
        </View>
      ) : (
        <>
          {!!error && (
            <View style={{ gap: 8, marginBottom: 10 }}>
              <ErrorNotice error={error} />
              <Button
                small
                style={{ minHeight: 44, alignSelf: "flex-start" }}
                onPress={() => setAttempt((value) => value + 1)}
              >
                {t("notes.checkHistoryRetry")}
              </Button>
            </View>
          )}
          {entries?.length ? (
            entries.map((check) => {
              const failed = check.status === "failed";
              const summary = failed ? t("notes.checkFailedLabel") : checkEntrySummary(check, t);
              return (
                <View
                  key={`${check.checkedAt}-${check.week}`}
                  accessibilityLabel={`${new Date(check.checkedAt).toLocaleString()}, ${summary}`}
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: colors.line,
                    paddingVertical: 12,
                    gap: 3,
                  }}
                >
                  <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                    <Text style={s.small}>{new Date(check.checkedAt).toLocaleString()}</Text>
                    {!!check.week && <Chip>{check.week}</Chip>}
                  </View>
                  <Text
                    style={[
                      s.text,
                      { fontSize: 13, fontWeight: "600" },
                      failed && { color: colors.danger },
                    ]}
                  >
                    {summary}
                  </Text>
                  {failed && (
                    <Text style={[s.small, { color: colors.danger }]}>
                      {t("notes.checkFailedReason", { error: check.error || "—" })}
                    </Text>
                  )}
                  {!failed && !!check.note && (
                    <Text style={[s.muted, { fontSize: 12 }]}>{check.note}</Text>
                  )}
                </View>
              );
            })
          ) : (
            <Text style={s.muted}>{t("notes.historyEmpty")}</Text>
          )}
        </>
      )}
      <Text style={[s.small, { color: colors.faint, marginTop: 14 }]}>{t("notes.aiNotice")}</Text>
    </Sheet>
  );
}

export function ConfirmStatusSheet({
  api,
  note,
  onClose,
  onDone,
}: {
  api: LingWuApi;
  note: InvestmentNote;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<ThesisStatus>();
  const [error, setError] = useState("");

  const apply = async (status: ThesisStatus) => {
    setBusy(status);
    setError("");
    try {
      await updateNote(api, note.id, { status });
      onDone();
    } catch {
      setError(t("notes.saveError"));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Sheet title={t("notes.confirmTitle")} onClose={onClose}>
      {note.check && (
        <View
          style={[
            s.row,
            {
              gap: 6,
              padding: 10,
              borderRadius: 10,
              backgroundColor:
                note.check.outcome === "pending_confirmation"
                  ? colors.alertVolumeSurface
                  : colors.surface,
              marginBottom: 14,
            },
          ]}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              color:
                note.check.outcome === "pending_confirmation"
                  ? colors.alertVolumeText
                  : colors.text,
            }}
          >
            {checkSummary(note, t)}
            {note.check.note ? ` · ${note.check.note}` : ""}
          </Text>
        </View>
      )}
      <View style={{ gap: 10 }}>
        {(
          [
            { status: "VALIDATED", label: "notes.validateValid" },
            { status: "INVALIDATED", label: "notes.validateInvalid" },
            { status: "ACTIVE", label: "notes.validateKeepPending" },
          ] as Array<{ status: ThesisStatus; label: TranslationKey }>
        ).map((option) => (
          <Button
            key={option.status}
            primary={option.status === "VALIDATED"}
            busy={busy === option.status}
            disabled={!!busy}
            style={{ minHeight: 44 }}
            onPress={() => void apply(option.status)}
          >
            {t(option.label)}
          </Button>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => void apply("EXPIRED")}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={[s.small, { color: colors.faint, textAlign: "center" }]}>
            {t("notes.markExpired")}
          </Text>
        </Pressable>
      </View>
      <ErrorNotice error={error} />
      <Text style={[s.small, { color: colors.faint, marginTop: 12 }]}>{t("notes.aiNotice")}</Text>
    </Sheet>
  );
}

export function NoteDetailSheet({
  api,
  note,
  onClose,
  onEdit,
  onChanged,
}: {
  api: LingWuApi;
  note: InvestmentNote;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { ask, close } = useWorkspace();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Sheet title={`${note.symbolCode} · ${t(TYPE_LABEL[note.type])}`} onClose={onClose}>
      <View style={[s.row, { gap: 6, flexWrap: "wrap", marginBottom: 12 }]}>
        <NoteTypeChip type={note.type} />
        <Chip>{note.symbolCode}</Chip>
        {note.type === "THESIS" && <ThesisStatusChip status={note.status} />}
        {note.type === "THESIS" && <ThesisCheckChip note={note} />}
      </View>
      {!!note.title && <Text style={[s.heading, { marginBottom: 8 }]}>{note.title}</Text>}
      <Text style={[s.text, { fontSize: 15, lineHeight: 24 }]}>{note.content}</Text>
      {note.type === "THESIS" && (
        <View
          style={[
            s.card,
            {
              marginTop: 14,
              padding: 12,
              gap: 8,
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}
        >
          <Text
            style={[
              s.small,
              {
                color:
                  note.check?.outcome === "pending_confirmation"
                    ? colors.alertVolumeText
                    : colors.muted,
              },
            ]}
          >
            {noteCheckLine(note, t)}
          </Text>
          {!!note.check?.note && (
            <Text style={[s.small, { color: colors.faint }]}>{note.check.note}</Text>
          )}
          <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
            <Button small style={{ minHeight: 44 }} onPress={() => setConfirmStatus(true)}>
              {note.check?.outcome === "pending_confirmation"
                ? t("notes.confirmStatus")
                : t("notes.updateStatus")}
            </Button>
            <Button small style={{ minHeight: 44 }} onPress={() => setHistoryOpen(true)}>
              {t("notes.checkHistory")}
            </Button>
          </View>
        </View>
      )}
      <Text style={[s.small, { color: colors.faint, marginTop: 14 }]}>
        {t("notes.detailCreated", { time: new Date(note.createdAt).toLocaleString() })} ·{" "}
        {t("notes.detailUpdated", { time: new Date(note.updatedAt).toLocaleString() })}
      </Text>
      <ErrorNotice error={error} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <Button small icon={Pencil} style={{ minHeight: 44 }} onPress={onEdit}>
          {t("notes.editNote")}
        </Button>
        <Button
          small
          icon={MessageCircle}
          style={{ minHeight: 44 }}
          onPress={() => {
            close();
            ask(
              t("notes.followUpPrompt", {
                symbol: note.symbolCode,
                excerpt: note.content.slice(0, 60),
              }),
            );
          }}
        >
          {t("notes.followUp")}
        </Button>
        <Button
          small
          danger
          icon={Trash2}
          style={{ minHeight: 44 }}
          onPress={() => setConfirmDelete(true)}
        >
          {t("notes.deleteNote")}
        </Button>
      </View>
      {note.type === "THESIS" && note.check && (
        <Text style={[s.small, { color: colors.faint, marginTop: 12 }]}>{t("notes.aiNotice")}</Text>
      )}
      <DisclaimerNote />

      {confirmDelete && (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setConfirmDelete(false)}
        >
          <Pressable onPress={() => setConfirmDelete(false)} style={s.modalShade}>
            <Pressable
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={[s.card, { maxWidth: 360, width: "100%", padding: 22, gap: 10 }]}
            >
              <Text style={s.heading}>{t("notes.deleteConfirm")}</Text>
              <View style={[s.row, { gap: 10, marginTop: 8 }]}>
                <Button style={{ flex: 1, minHeight: 44 }} onPress={() => setConfirmDelete(false)}>
                  {t("notes.cancel")}
                </Button>
                <Button
                  danger
                  busy={busy}
                  style={{ flex: 1, minHeight: 44 }}
                  onPress={() => {
                    void (async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await deleteNote(api, note.id);
                        onChanged();
                      } catch {
                        setError(t("notes.saveError"));
                      } finally {
                        setBusy(false);
                        setConfirmDelete(false);
                      }
                    })();
                  }}
                >
                  {t("notes.deleteConfirmAction")}
                </Button>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {historyOpen && (
        <CheckHistorySheet api={api} note={note} onClose={() => setHistoryOpen(false)} />
      )}
      {confirmStatus && (
        <ConfirmStatusSheet
          api={api}
          note={note}
          onClose={() => setConfirmStatus(false)}
          onDone={() => {
            setConfirmStatus(false);
            onChanged();
          }}
        />
      )}
    </Sheet>
  );
}

/** 标的详情内嵌笔记区（价格提醒之后、新闻之前）。 */
export function SymbolNotesSection({
  api,
  symbolCode,
  onOpenTheses,
}: {
  api: LingWuApi;
  symbolCode: string;
  onOpenTheses: () => void;
}) {
  const { t } = useTranslation();
  const state = useNotesState();
  const [editorOpen, setEditorOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<InvestmentNote>();
  const [editTarget, setEditTarget] = useState<InvestmentNote>();

  useEffect(() => {
    void loadNotes(api);
  }, [api]);

  const symbolNotes = useMemo(
    () =>
      state.notes
        .filter((note) => note.symbolCode === symbolCode)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.notes, symbolCode],
  );
  const theses = symbolNotes.filter((note) => note.type === "THESIS");
  const counts = {
    VALIDATED: theses.filter((note) => note.status === "VALIDATED").length,
    ACTIVE: theses.filter((note) => note.status === "ACTIVE").length,
  };

  const filteredNotes = query.trim()
    ? symbolNotes.filter((note) =>
        `${note.title ?? ""} ${note.content} ${note.symbolCode}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : symbolNotes;

  return (
    <View style={{ gap: 8 }}>
      <View style={[s.between, { flexWrap: "wrap", gap: 8, marginTop: 18, marginBottom: 2 }]}>
        <Text style={[s.label, { color: colors.faint }]}>{t("notes.symbolNotesTitle")}</Text>
        <View style={[s.row, { gap: 10 }]}>
          <Button
            small
            icon={Plus}
            hitSlop={6}
            style={{ minHeight: 44 }}
            onPress={() => setEditorOpen(true)}
          >
            {t("notes.writeNote")}
          </Button>
          <Pressable
            accessibilityRole="button"
            onPress={() => setAllOpen(true)}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[s.small, { color: colors.primaryStrong, fontWeight: "600" }]}>
              {t("notes.viewAll")}
            </Text>
          </Pressable>
        </View>
      </View>

      {state.status === "loading" && symbolNotes.length === 0 ? (
        <View style={{ gap: 8 }}>
          {[0, 1].map((index) => (
            <View
              key={index}
              style={{
                height: 64,
                borderRadius: 14,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            />
          ))}
        </View>
      ) : symbolNotes.length ? (
        symbolNotes
          .slice(0, 3)
          .map((note) => (
            <NoteCard key={note.id} note={note} compact onPress={() => setDetail(note)} />
          ))
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={s.muted}>{t("notes.symbolNotesEmpty")}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditorOpen(true)}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[s.small, { color: colors.primaryStrong, fontWeight: "600" }]}>
              {t("notes.writeFirst")}
            </Text>
          </Pressable>
        </View>
      )}

      {theses.length > 0 && (
        <View style={[s.row, { gap: 8, flexWrap: "wrap", marginTop: 4 }]}>
          <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
            {t("notes.thesisCount", { count: theses.length })}
          </Text>
          {counts.VALIDATED > 0 && (
            <Chip>
              {t("notes.statusValid")} {counts.VALIDATED}
            </Chip>
          )}
          {counts.ACTIVE > 0 && (
            <Chip>
              {t("notes.statusPending")} {counts.ACTIVE}
            </Chip>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onOpenTheses}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[s.small, { color: colors.primaryStrong, fontWeight: "600" }]}>
              {t("notes.viewThesis")}
            </Text>
          </Pressable>
        </View>
      )}

      {editorOpen && (
        <NoteEditorSheet
          api={api}
          defaultSymbol={symbolCode}
          onClose={() => setEditorOpen(false)}
          onSaved={() => setEditorOpen(false)}
        />
      )}
      {detail && (
        <NoteDetailSheet
          api={api}
          note={state.notes.find((note) => note.id === detail.id) ?? detail}
          onClose={() => setDetail(undefined)}
          onEdit={() => {
            setEditTarget(detail);
            setDetail(undefined);
          }}
          onChanged={() => setDetail(undefined)}
        />
      )}
      {editTarget && (
        <NoteEditorSheet
          api={api}
          initial={editTarget}
          onClose={() => setEditTarget(undefined)}
          onSaved={() => setEditTarget(undefined)}
        />
      )}
      {allOpen && (
        <Sheet title={t("notes.symbolNotesTitle")} onClose={() => setAllOpen(false)} fullscreen>
          <View style={[s.row, { gap: 8, flexWrap: "wrap", marginBottom: 12 }]}>
            <View
              style={[
                s.row,
                {
                  flex: 1,
                  minWidth: 200,
                  gap: 8,
                  minHeight: 44,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.line,
                },
              ]}
            >
              <Search size={17} color={colors.faint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("notes.searchPlaceholder")}
                placeholderTextColor={colors.faint}
                accessibilityLabel={t("notes.searchPlaceholder")}
                style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 8 }}
              />
            </View>
            <Button
              primary
              icon={Plus}
              style={{ minHeight: 44 }}
              onPress={() => setEditorOpen(true)}
            >
              {t("notes.writeNote")}
            </Button>
          </View>
          {filteredNotes.length ? (
            <View style={{ gap: 8 }}>
              {filteredNotes.map((note) => (
                <NoteCard key={note.id} note={note} onPress={() => setDetail(note)} />
              ))}
            </View>
          ) : (
            <Text style={s.muted}>{t("notes.symbolNotesEmpty")}</Text>
          )}
          <DisclaimerNote />
        </Sheet>
      )}
    </View>
  );
}
