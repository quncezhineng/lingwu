/**
 * P1-F2 投资笔记中心（NotesScreen）：笔记 Tab + 论点追踪 Tab。
 *
 * 硬口径：论点状态（成立/待验证/不成立/已过期）与检验态（待人工确认）分开表达；
 * 无模型时只显示「待人工确认（未配置模型，未生成结论）」，绝不出现自动判定结果；
 * AI 结论区块固定附声明，页面底部统一 DisclaimerNote。
 */
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { AlertTriangle, CalendarClock, Plus, Search, Target } from "./icons";
import {
  CheckHistorySheet,
  ConfirmStatusSheet,
  NoteCard,
  NoteDetailSheet,
  NoteEditorSheet,
  noteCheckLine,
  ThesisCheckChip,
  ThesisStatusChip,
} from "./note-ui";
import {
  consumeNotesIntent,
  groupNotesByDate,
  type InvestmentNote,
  loadNotes,
  NOTE_TYPES,
  type NoteType,
  runThesisCheck,
  sortTheses,
  THESIS_STATUSES,
  type ThesisStatus,
  useNotesState,
} from "./notes";
import { breakpoints } from "./theme";
import { Button, Card, Chip, colors, DisclaimerNote, Empty, ErrorNotice, s } from "./ui";
import { useWorkspace } from "./workspace";

const TYPE_KEYS: Record<NoteType, TranslationKey> = {
  BUY_REASON: "notes.typeBuy",
  SELL_REASON: "notes.typeSell",
  RESEARCH: "notes.typeResearch",
  THESIS: "notes.typeThesis",
};

const STATUS_KEYS: Record<ThesisStatus, TranslationKey> = {
  ACTIVE: "notes.statusPending",
  VALIDATED: "notes.statusValid",
  INVALIDATED: "notes.statusInvalid",
  EXPIRED: "notes.statusExpired",
};

function ChipButton({
  label,
  count,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  count?: number;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.line,
        backgroundColor: selected ? colors.sky : colors.paper,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: selected ? "600" : "500",
          color: selected ? colors.primary : disabled ? colors.faint : colors.muted,
        }}
      >
        {label}
      </Text>
      {count !== undefined && (
        <Text style={{ fontSize: 11, color: selected ? colors.primary : colors.faint }}>
          {count}
        </Text>
      )}
    </Pressable>
  );
}

function SymbolFilterModal({
  symbols,
  selected,
  onSelect,
  onClose,
}: {
  symbols: string[];
  selected?: string;
  onSelect: (symbol?: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const filtered = symbols.filter((symbol) =>
    `${symbol}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable onPress={onClose} style={s.modalShade}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[s.card, { maxWidth: 420, width: "100%", padding: 16, gap: 10 }]}
        >
          <Text style={s.heading}>{t("notes.symbolPickerTitle")}</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("notes.searchPlaceholder")}
            placeholderTextColor={colors.faint}
            accessibilityLabel={t("notes.symbolPickerTitle")}
            style={s.input}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onSelect(undefined);
              onClose();
            }}
            style={{
              minHeight: 44,
              justifyContent: "center",
              paddingHorizontal: 8,
              borderRadius: 7,
              backgroundColor: selected ? "transparent" : colors.sky,
            }}
          >
            <Text style={s.text}>{t("notes.allSymbols")}</Text>
          </Pressable>
          <View style={{ maxHeight: 320 }}>
            {filtered.map((symbol) => (
              <Pressable
                key={symbol}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === symbol }}
                onPress={() => {
                  onSelect(symbol);
                  onClose();
                }}
                style={{
                  minHeight: 48,
                  justifyContent: "center",
                  paddingHorizontal: 8,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                  backgroundColor: selected === symbol ? colors.sky : "transparent",
                }}
              >
                <Text style={s.text}>{symbol}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ThesisCard({
  note,
  onHistory,
  onUpdateStatus,
}: {
  note: InvestmentNote;
  onHistory: () => void;
  onUpdateStatus: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const pending = note.check?.outcome === "pending_confirmation";
  const long = note.content.length > 160;
  return (
    <Card style={{ padding: 14, gap: 8 }}>
      <View style={[s.between, { gap: 8 }]}>
        <View style={[s.row, { gap: 6, flexWrap: "wrap", flex: 1 }]}>
          <Chip>{note.symbolCode}</Chip>
          <ThesisStatusChip status={note.status} />
          <ThesisCheckChip note={note} />
        </View>
        <Text style={[s.small, s.metric, { color: colors.faint }]}>
          {new Date(note.createdAt).toLocaleDateString()}
        </Text>
      </View>
      {!!note.title && (
        <Text style={[s.text, { fontSize: 15, fontWeight: "600" }]} numberOfLines={2}>
          {note.title}
        </Text>
      )}
      <Text
        style={[s.text, { fontSize: 15, lineHeight: 22 }]}
        numberOfLines={expanded ? undefined : 4}
      >
        {note.content}
      </Text>
      {long && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((current) => !current)}
          style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}
        >
          <Text style={[s.small, { color: colors.primaryStrong, fontWeight: "600" }]}>
            {expanded ? t("notes.collapse") : t("notes.expand")}
          </Text>
        </Pressable>
      )}
      <Text
        style={[
          s.small,
          {
            color: pending ? colors.alertVolumeText : note.check ? colors.muted : colors.faint,
          },
        ]}
      >
        {noteCheckLine(note, t)}
      </Text>
      <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
        <Button small style={{ minHeight: 44 }} onPress={onHistory}>
          {t("notes.checkHistory")}
        </Button>
        <Button small primary={pending} style={{ minHeight: 44 }} onPress={onUpdateStatus}>
          {pending ? t("notes.confirmStatus") : t("notes.updateStatus")}
        </Button>
      </View>
    </Card>
  );
}

export function NotesScreen() {
  const { api, notify } = useWorkspace();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const state = useNotesState();
  const [tab, setTab] = useState<"notes" | "theses">("notes");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [typeFilter, setTypeFilter] = useState<NoteType | "all">("all");
  const [symbolFilter, setSymbolFilter] = useState<string>();
  const [symbolPicker, setSymbolPicker] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ThesisStatus | "all">("all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [editor, setEditor] = useState<{ note?: InvestmentNote; type?: NoteType }>();
  const [detail, setDetail] = useState<InvestmentNote>();
  const [editTarget, setEditTarget] = useState<InvestmentNote>();
  const [historyTarget, setHistoryTarget] = useState<InvestmentNote>();
  const [statusTarget, setStatusTarget] = useState<InvestmentNote>();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");

  useEffect(() => {
    const intent = consumeNotesIntent();
    if (intent) {
      setTab(intent.tab);
      if (intent.symbol) setSymbolFilter(intent.symbol);
    }
    void loadNotes(api);
  }, [api]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim().toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const symbols = useMemo(
    () => [...new Set(state.notes.map((note) => note.symbolCode))].sort(),
    [state.notes],
  );

  const filteredNotes = useMemo(
    () =>
      state.notes.filter((note) => {
        if (typeFilter !== "all" && note.type !== typeFilter) return false;
        if (symbolFilter && note.symbolCode !== symbolFilter) return false;
        if (!debounced) return true;
        return `${note.title ?? ""} ${note.content} ${note.symbolCode}`
          .toLowerCase()
          .includes(debounced);
      }),
    [state.notes, typeFilter, symbolFilter, debounced],
  );

  const theses = useMemo(
    () => sortTheses(filteredNotes.filter((note) => note.type === "THESIS")),
    [filteredNotes],
  );
  const pendingCount = useMemo(
    () =>
      state.notes.filter(
        (note) => note.type === "THESIS" && note.check?.outcome === "pending_confirmation",
      ).length,
    [state.notes],
  );
  const statusCounts = useMemo(() => {
    const count: Record<string, number> = { all: theses.length };
    for (const status of THESIS_STATUSES) count[status] = 0;
    for (const note of theses)
      count[note.status ?? "ACTIVE"] = (count[note.status ?? "ACTIVE"] ?? 0) + 1;
    return count;
  }, [theses]);
  const visibleTheses = useMemo(() => {
    let list = theses;
    if (statusFilter !== "all")
      list = list.filter((note) => (note.status ?? "ACTIVE") === statusFilter);
    if (pendingOnly) list = list.filter((note) => note.check?.outcome === "pending_confirmation");
    return list;
  }, [theses, statusFilter, pendingOnly]);

  const typeCounts = useMemo(() => {
    const count: Record<string, number> = { all: 0 };
    for (const note of state.notes) {
      count.all = (count.all ?? 0) + 1;
      count[note.type] = (count[note.type] ?? 0) + 1;
    }
    return count;
  }, [state.notes]);

  const filtersActive = typeFilter !== "all" || !!symbolFilter || !!debounced;

  async function runCheck() {
    setChecking(true);
    setCheckError("");
    try {
      await runThesisCheck(api);
      notify(t("notes.checkDone"));
    } catch {
      setCheckError(t("notes.checkFailed"));
    } finally {
      setChecking(false);
    }
  }

  const groups = groupNotesByDate(filteredNotes);
  const groupOrder: Array<{ key: keyof typeof groups; label: TranslationKey }> = [
    { key: "today", label: "notes.groupToday" },
    { key: "yesterday", label: "notes.groupYesterday" },
    { key: "week", label: "notes.groupThisWeek" },
    { key: "earlier", label: "notes.groupEarlier" },
  ];

  return (
    <View style={{ gap: 14 }}>
      <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <View
            style={[
              s.row,
              {
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
            {!!query && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("notes.clearFilters")}
                onPress={() => setQuery("")}
                style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: colors.faint, fontSize: 16 }}>×</Text>
              </Pressable>
            )}
          </View>
        </View>
        <Button
          primary={state.notes.length > 0}
          icon={Plus}
          style={{ minHeight: 44 }}
          onPress={() =>
            setEditor({
              type: tab === "theses" ? "THESIS" : "RESEARCH",
            })
          }
        >
          {t("notes.writeNote")}
        </Button>
      </View>

      <View
        style={{
          flexDirection: "row",
          gap: 3,
          padding: 3,
          borderRadius: 999,
          backgroundColor: colors.surface,
          alignSelf: width < 600 ? "stretch" : "flex-start",
        }}
      >
        {(
          [
            { id: "notes", label: t("notes.tabNotes") },
            { id: "theses", label: t("notes.tabTheses") },
          ] as Array<{ id: "notes" | "theses"; label: string }>
        ).map((item) => {
          const active = tab === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(item.id)}
              style={{
                flex: width < 600 ? 1 : undefined,
                minHeight: 44,
                paddingHorizontal: 18,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                backgroundColor: active ? colors.paper : "transparent",
                borderWidth: active ? 1 : 0,
                borderColor: colors.line,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: active ? "600" : "500",
                  color: active ? colors.text : colors.muted,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {state.status === "loading" && state.notes.length === 0 ? (
        <View style={{ gap: 8 }}>
          {[0, 1, 2, 3].map((index) => (
            <View
              key={index}
              style={{
                height: 92,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.surface,
              }}
            />
          ))}
        </View>
      ) : state.error && state.source === "api" && state.notes.length === 0 ? (
        <View style={{ gap: 8 }}>
          <ErrorNotice error={t("notes.loadError")} />
          <Button icon={Target} style={{ minHeight: 44 }} onPress={() => void loadNotes(api, true)}>
            {t("notes.retry")}
          </Button>
        </View>
      ) : tab === "notes" ? (
        <>
          {/* 空笔记时隐藏第三排筛选，避免首屏被筛选占满 */}
          {state.notes.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <ChipButton
                label={t("notes.allTypes")}
                count={typeCounts.all}
                selected={typeFilter === "all"}
                onPress={() => setTypeFilter("all")}
              />
              {NOTE_TYPES.map((type) => (
                <ChipButton
                  key={type}
                  label={t(TYPE_KEYS[type])}
                  count={typeCounts[type] ?? 0}
                  selected={typeFilter === type}
                  onPress={() => setTypeFilter(type)}
                />
              ))}
              <ChipButton
                label={symbolFilter ? `${symbolFilter} ×` : `${t("notes.allSymbols")} ▾`}
                selected={!!symbolFilter}
                onPress={() => (symbolFilter ? setSymbolFilter(undefined) : setSymbolPicker(true))}
              />
              {filtersActive && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setTypeFilter("all");
                    setSymbolFilter(undefined);
                    setQuery("");
                  }}
                  style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 6 }}
                >
                  <Text style={[s.small, { color: colors.primaryStrong, fontWeight: "600" }]}>
                    {t("notes.clearFilters")}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {filteredNotes.length === 0 ? (
            state.notes.length === 0 ? (
              <Empty icon={Target} title={t("notes.emptyTitle")} detail={t("notes.emptyDetail")}>
                <Button
                  primary
                  icon={Plus}
                  style={{ minHeight: 44 }}
                  onPress={() => setEditor({ type: "RESEARCH" })}
                >
                  {t("notes.emptyCreate")}
                </Button>
              </Empty>
            ) : (
              <Empty
                icon={Search}
                title={t("notes.noResultsTitle")}
                detail={t("notes.noResultsDetail")}
              >
                <Button
                  style={{ minHeight: 44 }}
                  onPress={() => {
                    setTypeFilter("all");
                    setSymbolFilter(undefined);
                    setQuery("");
                  }}
                >
                  {t("notes.clearFilters")}
                </Button>
              </Empty>
            )
          ) : (
            groupOrder.map((group) =>
              groups[group.key].length ? (
                <View key={group.key} style={{ gap: 8 }}>
                  <Text style={[s.label, { color: colors.faint, marginTop: 8 }]}>
                    {t(group.label)}
                  </Text>
                  {groups[group.key].map((note) => (
                    <NoteCard key={note.id} note={note} onPress={() => setDetail(note)} />
                  ))}
                </View>
              ) : null,
            )
          )}
          <DisclaimerNote />
        </>
      ) : (
        <>
          <View
            style={[
              s.row,
              {
                gap: 8,
                padding: 12,
                borderRadius: 10,
                backgroundColor: colors.surface,
                flexWrap: "wrap",
              },
            ]}
          >
            <CalendarClock size={15} color={colors.muted} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.muted }}>
              {state.check
                ? t("notes.weeklyBanner", {
                    last: new Date(state.check.checkedAt).toLocaleString(),
                    next: state.nextRun ? new Date(state.nextRun).toLocaleString() : "—",
                  })
                : t("notes.weeklyNever")}
            </Text>
            <Button small style={{ minHeight: 44 }} busy={checking} onPress={() => void runCheck()}>
              {checking ? t("notes.checking") : t("notes.runNow")}
            </Button>
          </View>
          <ErrorNotice error={checkError} />
          {pendingCount > 0 && (
            <View
              style={[
                s.row,
                {
                  gap: 8,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: colors.alertVolumeSurface,
                  flexWrap: "wrap",
                },
              ]}
            >
              <AlertTriangle size={15} color={colors.alertVolumeText} />
              <Text
                style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.alertVolumeText }}
              >
                {t("notes.pendingBanner", { count: pendingCount })}
              </Text>
              <Button
                small
                style={{ minHeight: 44 }}
                onPress={() => {
                  setPendingOnly(true);
                  setStatusFilter("all");
                }}
              >
                {t("notes.goConfirm")}
              </Button>
            </View>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <ChipButton
              label={t("notes.statusAll")}
              count={statusCounts.all}
              selected={statusFilter === "all" && !pendingOnly}
              onPress={() => {
                setStatusFilter("all");
                setPendingOnly(false);
              }}
            />
            {THESIS_STATUSES.map((status) => (
              <ChipButton
                key={status}
                label={t(STATUS_KEYS[status])}
                count={statusCounts[status] ?? 0}
                selected={statusFilter === status}
                disabled={(statusCounts[status] ?? 0) === 0}
                onPress={() => {
                  setStatusFilter(status);
                  setPendingOnly(false);
                }}
              />
            ))}
            {pendingOnly && <Chip>{t("notes.checkPendingConfirm")}</Chip>}
          </View>

          {visibleTheses.length === 0 ? (
            <Empty
              icon={Target}
              title={t("notes.thesisEmptyTitle")}
              detail={t("notes.thesisEmptyDetail")}
            >
              <Button
                primary
                icon={Plus}
                style={{ minHeight: 44 }}
                onPress={() => setEditor({ type: "THESIS" })}
              >
                {t("notes.thesisCreate")}
              </Button>
            </Empty>
          ) : (
            <View
              style={{
                flexDirection: width >= 600 ? "row" : "column",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              {visibleTheses.map((note) => (
                <View
                  key={note.id}
                  style={{
                    flexBasis: width >= breakpoints.desktop ? "48%" : width >= 600 ? "48%" : "100%",
                    flexGrow: 1,
                  }}
                >
                  <ThesisCard
                    note={note}
                    onHistory={() => setHistoryTarget(note)}
                    onUpdateStatus={() => setStatusTarget(note)}
                  />
                </View>
              ))}
            </View>
          )}
          <Text style={[s.small, { color: colors.faint }]}>{t("notes.aiNotice")}</Text>
          <DisclaimerNote />
        </>
      )}

      {symbolPicker && (
        <SymbolFilterModal
          symbols={symbols}
          selected={symbolFilter}
          onSelect={setSymbolFilter}
          onClose={() => setSymbolPicker(false)}
        />
      )}
      {editor && (
        <NoteEditorSheet
          api={api}
          initial={editor.note}
          defaultType={editor.type}
          defaultSymbol={symbolFilter}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            notify(t("notes.saved"));
          }}
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
          onChanged={() => {
            setDetail(undefined);
            notify(t("notes.deleted"));
          }}
        />
      )}
      {editTarget && (
        <NoteEditorSheet
          api={api}
          initial={editTarget}
          onClose={() => setEditTarget(undefined)}
          onSaved={() => {
            setEditTarget(undefined);
            notify(t("notes.saved"));
          }}
        />
      )}
      {historyTarget && (
        <CheckHistorySheet
          api={api}
          note={state.notes.find((note) => note.id === historyTarget.id) ?? historyTarget}
          onClose={() => setHistoryTarget(undefined)}
        />
      )}
      {statusTarget && (
        <ConfirmStatusSheet
          api={api}
          note={state.notes.find((note) => note.id === statusTarget.id) ?? statusTarget}
          onClose={() => setStatusTarget(undefined)}
          onDone={() => {
            setStatusTarget(undefined);
            notify(t("notes.statusUpdated"));
          }}
        />
      )}
    </View>
  );
}
