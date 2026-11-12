import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "./app-text";
import type { LingWuApi } from "./api";
import { useTranslation } from "./i18n";
import { Button, colors, Field, Sheet, s } from "./ui";

export type AppConnectorView = {
  slug: string;
  name: string;
  summary: string;
  category: "research-data" | "search" | "office" | "documents" | "files" | "development";
  featured: boolean;
  auth: "token" | "api_key" | "url" | "authcode" | "platform" | "oauth";
  hint: string;
  docsUrl?: string;
  connected: boolean;
  toolCount: number;
  missing: string[];
};

type CatalogResponse = { items: AppConnectorView[]; connectedCount: number };

export function useAppConnectors(api: LingWuApi) {
  const [items, setItems] = useState<AppConnectorView[]>([]);
  const [connectedCount, setConnectedCount] = useState(0);
  const refresh = useCallback(async () => {
    const payload = await api.request<CatalogResponse>("/api/app-connectors");
    setItems(payload.items);
    setConnectedCount(payload.connectedCount);
  }, [api]);
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);
  return { items, connectedCount, refresh };
}

export function AppConnectorSheet({
  item,
  api,
  onClose,
  onChanged,
}: {
  item: AppConnectorView;
  api: LingWuApi;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const blocked = item.auth === "oauth" || (item.auth === "platform" && item.missing.length > 0 && !item.connected);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api.request(`/api/app-connectors/${item.slug}/connect`, {
        ...(token ? { token } : {}),
        ...(email ? { email } : {}),
        ...(code ? { code } : {}),
        ...(url ? { url } : {}),
      });
      setToken("");
      setCode("");
      setUrl("");
      onChanged();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.request(`/api/app-connectors/${item.slug}/disconnect`, {});
      onChanged();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={item.name} subtitle={item.summary} onClose={onClose}>
      <View style={{ gap: 14 }}>
        <Text style={[s.muted, { lineHeight: 20 }]}>{item.hint}</Text>
        {item.missing.map((line) => (
          <Text key={line} style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
            {line}
          </Text>
        ))}
        {item.auth === "token" || item.auth === "api_key" ? (
          <Field
            label={item.auth === "token" ? "MCP key" : "API key"}
            value={token}
            onChangeText={setToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}
        {item.auth === "authcode" ? (
          <>
            <Field label={t("agent.hubConnectorEmail")} value={email} onChangeText={setEmail} autoCapitalize="none" />
            <Field
              label={t("agent.hubConnectorCode")}
              value={code}
              onChangeText={setCode}
              secureTextEntry
              autoCapitalize="none"
            />
          </>
        ) : null}
        {item.auth === "url" ? (
          <Field
            label={t("agent.hubConnectorUrl")}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}
        {!!message && <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 20 }}>{message}</Text>}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {item.connected ? (
            <Button variant="outline" style={{ flex: 1 }} disabled={busy} onPress={() => void disconnect()}>
              {t("agent.hubConnectorDisconnect")}
            </Button>
          ) : null}
          {blocked ? null : (
            <Button style={{ flex: 1 }} disabled={busy} onPress={() => void submit()}>
              {t("agent.hubConnectorConnect")}
            </Button>
          )}
        </View>
      </View>
    </Sheet>
  );
}
