import { useThreads } from "@copilotkit/react-native/headless";
import { useMemo, useState } from "react";
import { Platform, type TextStyle, View } from "react-native";
import type { AgentArtifact, AgentTask } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { TextInput } from "./app-text";
import { fileSourceLabel, markdownExcerpt } from "./file-library";
import {
  type GlobalSearchKind,
  rankSearchDocuments,
  recentSearchDocuments,
  type SearchDocument,
} from "./global-search";
import { type TranslationKey, useTranslation } from "./i18n";
import { artifactTitle, statusLabel } from "./i18n/translate";
import {
  Bell,
  CalendarDays,
  FileText,
  Heart,
  type IconComponent,
  ListChecks,
  Mail as MailIcon,
  MessageCircle,
  Search as SearchIcon,
  X,
} from "./icons";
import { useLingWuThread } from "./threads";
import {
  Button,
  Card,
  colors,
  dateLabel,
  Empty,
  IconButton,
  LinkRow,
  radius,
  SectionHeading,
  Sheet,
  s,
  semantic,
} from "./ui";
import { useWorkspace } from "./workspace";

const KIND_LABELS: Record<GlobalSearchKind, TranslationKey> = {
  task: "search.kindTask",
  artifact: "search.kindArtifact",
  file: "search.kindFile",
  conversation: "search.kindConversation",
  mail: "search.kindMail",
  event: "search.kindEvent",
  memory: "search.kindMemory",
  monitor: "search.kindMonitor",
};

const KIND_ICONS: Record<GlobalSearchKind, IconComponent> = {
  task: ListChecks,
  artifact: FileText,
  file: FileText,
  conversation: MessageCircle,
  mail: MailIcon,
  event: CalendarDays,
  memory: Heart,
  monitor: Bell,
};

const KIND_ORDER: GlobalSearchKind[] = [
  "task",
  "artifact",
  "file",
  "conversation",
  "mail",
  "event",
  "memory",
  "monitor",
];

function splitArtifactHeadline(value: string) {
  const match = /^(.{1,80}?)[：:]\s+([\s\S]+)$/.exec(value.trim());
  if (!match) return { displayTitle: value.trim(), markdown: "" };
  const [, displayTitle, markdown] = match;
  const richTail =
    markdown.length > 80 || /(^#{1,6}\s)|(\*\*)|(`)|(^\s*(?:[-*+]|\d+\.)\s)/m.test(markdown);
  if (!richTail) return { displayTitle: value.trim(), markdown: "" };
  return { displayTitle: displayTitle.trim(), markdown: markdown.trim() };
}

function taskDocument(task: AgentTask): SearchDocument {
  return {
    id: task.id,
    kind: "task",
    title: task.title,
    detail: task.question || statusLabel(task.status),
    keywords: `${task.prompt} ${task.result ?? ""} ${task.evidence.map((item) => item.title).join(" ")}`,
    updatedAt: task.updatedAt,
  };
}

function artifactDocument(artifact: AgentArtifact): SearchDocument {
  // 标题按当前界面语言展示（服务端对「每日市场简报」等标题硬编码了英文）。
  const title = artifactTitle(artifact);
  const headline = splitArtifactHeadline(title);
  const markdownPreview = headline.markdown || artifact.summary.trim();
  return {
    id: artifact.id,
    kind: "artifact",
    title,
    displayTitle: headline.displayTitle,
    detail: markdownExcerpt(markdownPreview || statusLabel(artifact.kind), 160),
    detailMarkdown: markdownPreview || undefined,
    keywords: `${title} ${statusLabel(artifact.kind)} ${artifact.summary}`,
    updatedAt: artifact.createdAt,
  };
}

function memoryDocument(memory: {
  id: string;
  text: string;
  source?: string;
  createdAt: string;
}): SearchDocument {
  const plainPreview = markdownExcerpt(memory.text, 80);
  return {
    id: memory.id,
    kind: "memory",
    title: memory.text,
    displayTitle: plainPreview || memory.source || "Memory",
    detail: memory.source || plainPreview,
    detailMarkdown: memory.text.trim() || undefined,
    updatedAt: memory.createdAt,
  };
}

export function GlobalSearchSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { workspace, open, navigate } = useWorkspace();
  const { data } = useAgentWorkspace();
  const { enabled, visited, mainId, select } = useLingWuThread();
  const threads = useThreads({ agentId: "default", enabled, limit: 50 });
  const [query, setQuery] = useState("");

  const conversations = useMemo(() => {
    const names = new Map(
      threads.threads.map((thread) => [
        thread.id,
        thread.name || t("threads.untitledConversation"),
      ]),
    );
    const seen = new Set<string>();
    const ids = [
      mainId,
      ...visited.map((item) => item.id),
      ...threads.threads.map((item) => item.id),
    ];
    return ids
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((id, index) => ({
        id,
        name:
          id === mainId
            ? t("threads.mainChatTitle")
            : names.get(id) || t("threads.sideChatNumber", { index: index + 1 }),
      }));
  }, [mainId, t, threads.threads, visited]);

  const documents = useMemo<SearchDocument[]>(() => {
    return [
      ...(data?.tasks ?? []).map(taskDocument),
      ...(data?.artifacts ?? []).map(artifactDocument),
      ...workspace.files.map((file) => ({
        id: file.id,
        kind: "file" as const,
        title: file.name,
        detail: [fileSourceLabel(file.source, t), file.mimeType].filter(Boolean).join(" · "),
        keywords: `${file.mimeType} ${file.source}`,
        updatedAt: file.createdAt,
      })),
      ...conversations.map((conversation) => ({
        id: conversation.id,
        kind: "conversation" as const,
        title: conversation.name,
        detail:
          conversation.id === mainId ? t("threads.mainChatDetail") : t("threads.openInThisApp"),
      })),
      ...workspace.mail.map((mail) => ({
        id: mail.id,
        kind: "mail" as const,
        title: mail.subject,
        detail: mail.sender || mail.from,
        keywords: `${mail.body} ${mail.to.join(" ")} ${mail.label}`,
        updatedAt: mail.date,
      })),
      ...workspace.events.map((event) => ({
        id: event.id,
        kind: "event" as const,
        title: event.title,
        detail: [dateLabel(event.start), event.location].filter(Boolean).join(" · "),
        keywords: `${event.description} ${event.attendees.join(" ")}`,
        updatedAt: event.start,
      })),
      ...(data?.memories ?? []).map(memoryDocument),
      ...(data?.monitors ?? []).map((monitor) => ({
        id: monitor.id,
        kind: "monitor" as const,
        title: monitor.title,
        detail: monitor.description || monitor.lastValue || monitor.value || monitor.url,
        keywords: `${monitor.description ?? ""} ${monitor.url} ${monitor.status} ${monitor.lastValue ?? ""}`,
        updatedAt: monitor.lastCheckedAt || monitor.nextCheckAt,
      })),
    ];
  }, [conversations, data, mainId, t, workspace.events, workspace.files, workspace.mail]);

  const searching = query.trim().length > 0;
  const visible = searching
    ? rankSearchDocuments(documents, query)
    : recentSearchDocuments(documents);

  function choose(document: SearchDocument) {
    onClose();
    switch (document.kind) {
      case "task":
        open({ type: "task", taskId: document.id });
        return;
      case "artifact": {
        const artifact = data?.artifacts.find((item) => item.id === document.id);
        if (artifact) open({ type: "artifact", artifact });
        else navigate("files");
        return;
      }
      case "file": {
        const file = workspace.files.find((item) => item.id === document.id);
        if (file) open({ type: "file", file });
        else navigate("files");
        return;
      }
      case "conversation":
        select({ id: document.id, existing: true });
        return;
      case "mail": {
        const mail = workspace.mail.find((item) => item.id === document.id);
        if (mail) open({ type: "mail", mail });
        else navigate("mail");
        return;
      }
      case "event": {
        const event = workspace.events.find((item) => item.id === document.id);
        if (event) open({ type: "event", event });
        else navigate("calendar");
        return;
      }
      case "memory":
        navigate("memories");
        return;
      case "monitor":
        navigate("goals");
    }
  }

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: visible.filter((document) => document.kind === kind),
  })).filter((group) => group.items.length > 0);

  function renderDocumentRow(document: SearchDocument, recent = false) {
    const title = document.displayTitle ?? document.title;
    const detail = recent
      ? `${t(KIND_LABELS[document.kind])} · ${document.detail}`
      : document.detail;
    return (
      <LinkRow
        key={`${document.kind}-${document.id}`}
        icon={KIND_ICONS[document.kind]}
        title={title}
        detail={detail}
        onPress={() => choose(document)}
      />
    );
  }

  return (
    <Sheet title={t("search.title")} subtitle={t("search.subtitle")} onClose={onClose}>
      <View style={{ gap: 18 }}>
        <View
          style={[
            s.row,
            {
              gap: 8,
              minHeight: 44,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: semantic.controlBorder,
              borderRadius: radius.field,
              backgroundColor: colors.paper,
            },
          ]}
        >
          <SearchIcon size={18} color={colors.muted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => visible[0] && choose(visible[0])}
            returnKeyType="search"
            accessibilityLabel={t("search.placeholder")}
            placeholder={t("search.placeholder")}
            placeholderTextColor={colors.faint}
            style={[
              { flex: 1, minHeight: 42, color: colors.text, fontSize: 14 },
              Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : null,
            ]}
          />
          {query.length > 0 && (
            <IconButton icon={X} label={t("search.clear")} onPress={() => setQuery("")} />
          )}
        </View>

        {!visible.length ? (
          <Empty icon={SearchIcon} title={t("search.emptyTitle")} detail={t("search.emptyDetail")}>
            {searching && (
              <Button small onPress={() => setQuery("")}>
                {t("search.clear")}
              </Button>
            )}
          </Empty>
        ) : searching ? (
          groups.map((group) => (
            <View key={group.kind} style={{ gap: 8 }}>
              <SectionHeading title={t(KIND_LABELS[group.kind])} />
              <Card style={{ paddingVertical: 2 }}>
                {group.items.map((document) => renderDocumentRow(document))}
              </Card>
            </View>
          ))
        ) : (
          <View style={{ gap: 8 }}>
            <SectionHeading title={t("search.recent")} />
            <Card style={{ paddingVertical: 2 }}>
              {visible.map((document) => renderDocumentRow(document, true))}
            </Card>
          </View>
        )}
      </View>
    </Sheet>
  );
}
