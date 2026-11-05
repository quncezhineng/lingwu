import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, useWindowDimensions, View } from "react-native";
import type {
  CustomModelBatchInput,
  CustomModelInput,
  ModelDiscoveryResult,
  ModelLibrary,
  ModelLibraryEntry,
} from "../../../packages/domain/src/model-settings";
import { Text } from "./app-text";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import { Box, ChevronDown, ChevronLeft, ChevronRight, Cpu, Pencil, Plus, Trash2 } from "./icons";
import { Button, CheckRow, colors, Field, IconButton, radius, Sheet, s, space } from "./ui";
import { useWorkspace } from "./workspace";

/**
 * 「添加模型」的服务商预设。
 *
 * 地址都是各家的 OpenAI Chat Completions 兼容端点，用户可改；
 * 图标用字母标记代替品牌素材，避免引入第三方商标资源。
 */
const PROVIDER_PRESETS = [
  {
    id: "google",
    label: "Google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    mark: "G",
    tint: "#4285F4",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    mark: "O",
    tint: "#111827",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    mark: "D",
    tint: "#4D6BFE",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    mark: "A",
    tint: "#D97757",
  },
  { id: "xai", label: "xAI", baseUrl: "https://api.x.ai/v1", mark: "x", tint: "#111827" },
  {
    id: "zhipu",
    label: "智谱",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    mark: "Z",
    tint: "#7C3AED",
  },
  {
    id: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimaxi.com/v1",
    mark: "M",
    tint: "#E0617B",
  },
  {
    id: "moonshot",
    label: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    mark: "K",
    tint: "#16A34A",
  },
] as const;

type ProviderPreset = (typeof PROVIDER_PRESETS)[number];

/** 表格列宽：表头与数据行共用同一组常量，避免「服务商 / 操作」两列错位。 */
const PROVIDER_COLUMN = 160;
const ACTION_COLUMN = 108;
const ACTION_COLUMN_COMPACT = 96;
/** 行内模型图标占位，让表头「模型」与模型名左对齐。 */
const MODEL_ICON_WIDTH = 15;

const errorKeys = [
  "encryptionUnavailable",
  "backendUnavailable",
  "baseUrlNotAllowed",
  "apiKeyRequired",
  "authenticationFailed",
  "rateLimited",
  "connectionFailed",
  "modelUnavailable",
  "providerUnavailable",
] as const;

function useErrorMessage() {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown) => {
      const text = error instanceof Error ? error.message : "";
      return errorKeys.some((key) => text === `modelSettings.${key}`)
        ? t(text as TranslationKey)
        : t("modelSettings.requestFailed");
    },
    [t],
  );
}

/** 模型行末的启用开关；停用后该模型不会出现在选模型列表里。 */
function ModelSwitch({
  checked,
  label,
  disabled,
  onPress,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 35,
        height: 21,
        borderRadius: radius.full,
        padding: 3,
        opacity: disabled ? 0.5 : 1,
        alignItems: checked ? "flex-end" : "flex-start",
        backgroundColor: checked ? colors.primary : colors.lineStrong,
      }}
    >
      <View
        style={{ width: 15, height: 15, borderRadius: radius.full, backgroundColor: colors.paper }}
      />
    </Pressable>
  );
}

function GroupHeading({
  title,
  count,
  open,
  onToggle,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
      style={({ pressed }) => ({
        minHeight: 42,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        borderTopWidth: 1,
        borderTopColor: colors.lineSoft,
        backgroundColor: pressed ? colors.overlay1 : colors.surface,
      })}
    >
      {open ? (
        <ChevronDown size={15} color={colors.muted} />
      ) : (
        <ChevronRight size={15} color={colors.muted} />
      )}
      <Text style={[s.text, { fontSize: 13, fontWeight: "600" }]}>{title}</Text>
      <Text style={[s.small, { fontSize: 11, color: colors.faint }]}>{count}</Text>
    </Pressable>
  );
}

/** 一个模型行：内置只读显示「–」，自定义提供编辑、删除与启停。 */
function ModelRow({
  entry,
  compact,
  busy,
  onEdit,
  onRemove,
  onToggle,
}: {
  entry: ModelLibraryEntry;
  compact: boolean;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const provider =
    entry.provider === "custom"
      ? entry.providerLabel || t("modelSettings.customProvider")
      : entry.providerLabel;
  const actionWidth = compact ? ACTION_COLUMN_COMPACT : ACTION_COLUMN;
  return (
    <View
      style={{
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: compact ? 8 : 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: colors.lineSoft,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Cpu size={MODEL_ICON_WIDTH} color={entry.builtin ? colors.muted : colors.primary} />
          <Text numberOfLines={1} style={[s.text, { fontSize: 13 }]}>
            {entry.label}
          </Text>
        </View>
        {compact && (
          <Text numberOfLines={1} style={[s.small, { fontSize: 10, color: colors.faint }]}>
            {provider}
          </Text>
        )}
      </View>
      {!compact && (
        <Text
          numberOfLines={1}
          style={[s.small, { width: PROVIDER_COLUMN, fontSize: 11, color: colors.muted }]}
        >
          {provider}
        </Text>
      )}
      <View
        style={{
          width: actionWidth,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 2,
        }}
      >
        {entry.builtin ? (
          <Text style={[s.small, { fontSize: 12, color: colors.faint }]}>–</Text>
        ) : (
          <>
            <IconButton
              icon={Pencil}
              label={`${t("modelSettings.editModel")} ${entry.label}`}
              onPress={onEdit}
              size={30}
              disabled={busy}
            />
            <IconButton
              icon={Trash2}
              label={`${t("modelSettings.removeModel")} ${entry.label}`}
              onPress={onRemove}
              size={30}
              disabled={busy}
            />
            <ModelSwitch
              checked={entry.enabled}
              label={`${t("modelSettings.enableModel")} ${entry.label}`}
              disabled={busy}
              onPress={onToggle}
            />
          </>
        )}
      </View>
    </View>
  );
}

/** 新增 / 编辑自定义模型。密钥写后不可读，留空表示沿用原密钥。 */
function CustomModelForm({
  entry,
  onClose,
  onSaved,
}: {
  entry?: ModelLibraryEntry;
  onClose: () => void;
  onSaved: (library: ModelLibrary) => void;
}) {
  const { t } = useTranslation();
  const { api, notify } = useWorkspace();
  const message = useErrorMessage();
  const [model, setModel] = useState(entry ? entry.spec.replace("custom/", "") : "");
  const [label, setLabel] = useState(entry?.label ?? "");
  const [baseUrl, setBaseUrl] = useState(entry?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editing = Boolean(entry);
  const ready = Boolean(model.trim() && baseUrl.trim() && (apiKey.trim() || editing));

  async function submit() {
    setBusy(true);
    setError("");
    const payload: CustomModelInput = {
      model: model.trim(),
      baseUrl: baseUrl.trim(),
      enabled: entry?.enabled ?? true,
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    };
    try {
      const library = await api.request<ModelLibrary>("/api/model/library", payload, "PUT");
      notify(
        t(editing ? "modelSettings.modelUpdated" : "modelSettings.modelAdded", {
          model: label.trim() || model.trim(),
        }),
      );
      onSaved(library);
    } catch (submitError) {
      setError(message(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={t(editing ? "modelSettings.editModel" : "modelSettings.addModel")}
      subtitle={t("modelSettings.customProvider")}
      onClose={onClose}
      narrow
    >
      <Field
        label={t("modelSettings.modelId")}
        value={model}
        onChangeText={setModel}
        editable={!editing && !busy}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={t("modelSettings.modelIdPlaceholder")}
        maxLength={150}
      />
      <Field
        label={t("modelSettings.modelLabel")}
        value={label}
        onChangeText={setLabel}
        editable={!busy}
        placeholder={t("modelSettings.modelLabelPlaceholder")}
        maxLength={60}
      />
      <Field
        label={t("modelSettings.baseUrl")}
        value={baseUrl}
        onChangeText={setBaseUrl}
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://api.example.com/v1"
        maxLength={300}
      />
      <Field
        label="API Key"
        value={apiKey}
        onChangeText={setApiKey}
        editable={!busy}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="none"
        placeholder={editing ? t("modelSettings.keepKey") : "sk-…"}
      />
      <Text style={[s.small, { marginBottom: space.sm }]}>{t("modelSettings.customHint")}</Text>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>
          {error}
        </Text>
      )}
      <Button primary busy={busy} disabled={!ready || busy} onPress={() => void submit()}>
        {t("modelSettings.saveModel")}
      </Button>
    </Sheet>
  );
}

function ProviderMark({ preset }: { preset?: ProviderPreset }) {
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.lineSoft,
      }}
    >
      {preset ? (
        <Text style={{ fontSize: 13, fontWeight: "700", color: preset.tint }}>{preset.mark}</Text>
      ) : (
        <Box size={14} color={colors.muted} />
      )}
    </View>
  );
}

/** 服务商卡片（截图同款：浅底、左图标、右箭头）。 */
function ProviderCard({
  label,
  preset,
  wide,
  onPress,
}: {
  label: string;
  preset?: ProviderPreset;
  wide?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderRadius: radius.control,
        backgroundColor: pressed ? colors.overlay2 : colors.surface,
        ...(wide ? null : { flexBasis: "47%", flexGrow: 1, minWidth: 160 }),
      })}
    >
      <ProviderMark preset={preset} />
      <Text numberOfLines={1} style={[s.text, { flex: 1, fontSize: 13, fontWeight: "500" }]}>
        {label}
      </Text>
      <ChevronRight size={14} color={colors.faint} />
    </Pressable>
  );
}

/** 第二步：填写密钥 → 读取可用模型 → 勾选后批量添加。 */
function ProviderModelForm({
  preset,
  onBack,
  onSaved,
}: {
  preset: ProviderPreset;
  onBack: () => void;
  onSaved: (library: ModelLibrary) => void;
}) {
  const { t } = useTranslation();
  const { api, notify } = useWorkspace();
  const message = useErrorMessage();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState<string>(preset.baseUrl);
  const [models, setModels] = useState<string[]>();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function readModels() {
    if (!apiKey.trim()) {
      setError(t("modelSettings.apiKeyRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.request<ModelDiscoveryResult>(
        "/api/model/library/discover",
        { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() },
        "POST",
      );
      setModels(result.models);
      setSelected(result.models);
      if (!result.models.length) setError(t("modelSettings.noneFound"));
    } catch (readError) {
      setError(message(readError));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!selected.length) return;
    setBusy(true);
    setError("");
    const payload: CustomModelBatchInput = {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      models: selected,
      provider: preset.label,
    };
    try {
      const library = await api.request<ModelLibrary>("/api/model/library/batch", payload, "POST");
      notify(t("modelSettings.modelsAdded", { count: String(selected.length) }));
      onSaved(library);
    } catch (saveError) {
      setError(message(saveError));
    } finally {
      setBusy(false);
    }
  }

  const allSelected = Boolean(models?.length && selected.length === models.length);

  return (
    <View style={{ gap: space.sm }}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        hitSlop={8}
        style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 3 }}
      >
        <ChevronLeft size={15} color={colors.muted} />
        <Text style={[s.small, { fontSize: 12, color: colors.muted }]}>
          {t("modelSettings.backToProviders")}
        </Text>
      </Pressable>
      <Field
        label="API Key"
        value={apiKey}
        onChangeText={setApiKey}
        editable={!busy}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="none"
        placeholder="sk-…"
      />
      <Field
        label={t("modelSettings.baseUrl")}
        value={baseUrl}
        onChangeText={setBaseUrl}
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={300}
      />
      {models === undefined ? (
        <View style={{ gap: 8 }}>
          <Text style={[s.small, { fontSize: 11, color: colors.faint }]}>
            {t("modelSettings.providerKeyHint")}
          </Text>
          <Button primary busy={busy} disabled={busy} onPress={() => void readModels()}>
            {t("modelSettings.readModels")}
          </Button>
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text style={[s.text, { flex: 1, fontSize: 13, fontWeight: "600" }]}>
              {t("modelSettings.selectedCount", { count: String(selected.length) })}
            </Text>
            <Button small quietBusy onPress={() => setSelected(allSelected ? [] : (models ?? []))}>
              {allSelected ? t("modelSettings.clearSelection") : t("modelSettings.selectAll")}
            </Button>
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.control,
              overflow: "hidden",
            }}
          >
            {models.map((model) => (
              <View
                key={model}
                style={{
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.lineSoft,
                }}
              >
                <CheckRow
                  label={model}
                  checked={selected.includes(model)}
                  onPress={() =>
                    setSelected((current) =>
                      current.includes(model)
                        ? current.filter((item) => item !== model)
                        : [...current, model],
                    )
                  }
                />
              </View>
            ))}
          </View>
          {!!error && (
            <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>
              {error}
            </Text>
          )}
          <Button
            primary
            busy={busy}
            disabled={!selected.length || busy}
            onPress={() => void submit()}
          >
            {t("modelSettings.addSelectedModels", { count: String(selected.length) })}
          </Button>
        </View>
      )}
      {models === undefined && !!error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>
          {error}
        </Text>
      )}
    </View>
  );
}

/** 「添加模型」入口：先选服务商（或自定义模型），再进入对应配置。 */
function AddModelSheet({
  onClose,
  onCustom,
  onSaved,
}: {
  onClose: () => void;
  onCustom: () => void;
  onSaved: (library: ModelLibrary) => void;
}) {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<ProviderPreset>();
  if (preset)
    return (
      <Sheet title={preset.label} onClose={onClose} narrow>
        <ProviderModelForm preset={preset} onBack={() => setPreset(undefined)} onSaved={onSaved} />
      </Sheet>
    );
  return (
    <Sheet
      title={t("modelSettings.addModel")}
      subtitle={t("modelSettings.addModelHint")}
      onClose={onClose}
      narrow
    >
      <View style={{ gap: 10 }}>
        <ProviderCard label={t("modelSettings.customModelEntry")} wide onPress={onCustom} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {PROVIDER_PRESETS.map((item) => (
            <ProviderCard
              key={item.id}
              label={item.label}
              preset={item}
              onPress={() => setPreset(item)}
            />
          ))}
        </View>
      </View>
    </Sheet>
  );
}

/** 「模型管理」：内置模型只读展示，用户可在此添加自己的 OpenAI 兼容模型。 */
function ModelManager() {
  const { t } = useTranslation();
  const { api, notify, refresh } = useWorkspace();
  const message = useErrorMessage();
  const { width } = useWindowDimensions();
  const compact = width < 520;
  const [library, setLibrary] = useState<ModelLibrary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [builtinOpen, setBuiltinOpen] = useState(true);
  const [customOpen, setCustomOpen] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<ModelLibraryEntry>();
  const [removing, setRemoving] = useState<ModelLibraryEntry>();
  const [busyId, setBusyId] = useState<string>();
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void api
      .request<ModelLibrary>("/api/model/library")
      .then((value) => {
        if (active) setLibrary(value);
      })
      .catch((loadError) => {
        if (active) setError(message(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, message]);

  async function toggle(entry: ModelLibraryEntry) {
    setBusyId(entry.spec);
    setError("");
    try {
      const next = await api.request<ModelLibrary>(
        "/api/model/library",
        { model: entry.spec.replace("custom/", ""), enabled: !entry.enabled },
        "PATCH",
      );
      setLibrary(next);
      await refresh().catch(() => undefined);
      notify(
        t(entry.enabled ? "modelSettings.modelDisabled" : "modelSettings.modelEnabled", {
          model: entry.label,
        }),
      );
    } catch (toggleError) {
      setError(message(toggleError));
    } finally {
      setBusyId(undefined);
    }
  }

  async function remove() {
    if (!removing) return;
    setRemoveBusy(true);
    setError("");
    try {
      const next = await api.request<ModelLibrary>(
        `/api/model/library?model=${encodeURIComponent(removing.spec.replace("custom/", ""))}`,
        undefined,
        "DELETE",
      );
      setLibrary(next);
      await refresh().catch(() => undefined);
      notify(t("modelSettings.modelRemoved", { model: removing.label }));
      setRemoving(undefined);
    } catch (removeError) {
      setError(message(removeError));
    } finally {
      setRemoveBusy(false);
    }
  }

  function saved(next: ModelLibrary) {
    setLibrary(next);
    setFormOpen(false);
    setPickerOpen(false);
    setEditing(undefined);
    void refresh().catch(() => undefined);
  }

  if (loading)
    return (
      <ActivityIndicator accessibilityLabel={t("modelSettings.loading")} color={colors.primary} />
    );

  const rows = (entries: ModelLibraryEntry[]) =>
    entries.map((entry) => (
      <ModelRow
        key={entry.spec}
        entry={entry}
        compact={compact}
        busy={busyId === entry.spec}
        onEdit={() => {
          setEditing(entry);
          setFormOpen(true);
        }}
        onRemove={() => setRemoving(entry)}
        onToggle={() => void toggle(entry)}
      />
    ));

  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row" }}>
          <Button
            icon={Plus}
            small
            disabled={!library?.canConfigure}
            onPress={() => setPickerOpen(true)}
          >
            {t("modelSettings.addModel")}
          </Button>
        </View>
        {!library?.canConfigure && (
          <Text style={[s.small, { fontSize: 11, color: colors.faint }]}>
            {t("modelSettings.cannotConfigure")}
          </Text>
        )}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>
          {error}
        </Text>
      )}
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.control,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: MODEL_ICON_WIDTH }} />
            <Text style={s.label}>{t("modelSettings.colModel")}</Text>
          </View>
          {!compact && (
            <Text style={[s.label, { width: PROVIDER_COLUMN }]}>
              {t("modelSettings.colProvider")}
            </Text>
          )}
          <Text
            style={[
              s.label,
              { width: compact ? ACTION_COLUMN_COMPACT : ACTION_COLUMN, textAlign: "right" },
            ]}
          >
            {t("modelSettings.colActions")}
          </Text>
        </View>
        <GroupHeading
          title={t("modelSettings.groupBuiltin")}
          count={library?.builtin.length ?? 0}
          open={builtinOpen}
          onToggle={() => setBuiltinOpen(!builtinOpen)}
        />
        {builtinOpen && rows(library?.builtin ?? [])}
        <GroupHeading
          title={t("modelSettings.groupCustom")}
          count={library?.custom.length ?? 0}
          open={customOpen}
          onToggle={() => setCustomOpen(!customOpen)}
        />
        {customOpen && !library?.custom.length && (
          <Text style={[s.small, { padding: 14, textAlign: "center", color: colors.faint }]}>
            {t("modelSettings.libraryEmpty")}
          </Text>
        )}
        {customOpen && rows(library?.custom ?? [])}
      </View>
      {pickerOpen && (
        <AddModelSheet
          onClose={() => setPickerOpen(false)}
          onCustom={() => {
            setPickerOpen(false);
            setEditing(undefined);
            setFormOpen(true);
          }}
          onSaved={saved}
        />
      )}
      {formOpen && (
        <CustomModelForm
          entry={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(undefined);
          }}
          onSaved={saved}
        />
      )}
      {removing && (
        <Sheet
          title={t("modelSettings.removeModel")}
          subtitle={removing.label}
          onClose={() => setRemoving(undefined)}
          small
        >
          <Text style={[s.small, { marginBottom: space.md }]}>
            {t("modelSettings.removeModelNote")}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button danger busy={removeBusy} onPress={() => void remove()} style={{ flex: 1 }}>
              {t("modelSettings.removeModel")}
            </Button>
            <Button style={{ flex: 1 }} onPress={() => setRemoving(undefined)}>
              {t("common.cancel")}
            </Button>
          </View>
        </Sheet>
      )}
    </View>
  );
}

export function ModelSettingsSheet() {
  const { close } = useWorkspace();
  const { t } = useTranslation();
  return (
    <Sheet
      title={t("modelSettings.managerTitle")}
      subtitle={t("modelSettings.managerSubtitle")}
      onClose={close}
      medium
    >
      <ModelManager />
    </Sheet>
  );
}
