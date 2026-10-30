# LingWu feature inventory

The native and web agent core runs locally. This inventory describes the current implementation and remaining extensions. Live providers and optional infrastructure require separate configuration and validation.

## Implemented coverage

| Area | Current implementation | Remaining extension |
| --- | --- | --- |
| Chat / delegated work | Native CopilotKit chat, direct mail and time-bounded primary calendar reads, durable tasks and confirmed outcomes | Live model/provider acceptance testing |
| Ideas / personal context | Source-backed mail/goal rules, accept/edit/dismiss, identity, editable/forgettable memories | Broader model-derived cross-connector suggestions |
| Goals / Tracking | Milestones, recurring watches, observations, retry/backoff, pause and cancellation | Adaptive long-term planning and calendar-driven reminders |
| Browser | Persistent Chromium, public page reads, snapshots, console takeover, PDF downloads | Autonomous interactive booking and per-person VM orchestration |
| Linux computer | Nonroot Docker container, bounded bash/Python/Node/git commands, saved output and exit receipts, persistent workspace files, text editing, PDF import/export | Interactive terminal, desktop apps, controlled egress, disk quotas and stronger VM isolation |
| Gmail / Calendar | Google OAuth; complete threads; saved drafts; calendar/event CRUD with reviewed versions | Live Google acceptance, recurrence editing, other connectors |
| PDF job | Durable import, typed input request, filled-copy preview, reviewed reply, receipt | OCR/scanned forms and additional PDF field types |
| Generated results | Plans/reports/comparisons, finance CSV metrics, and scripts in the private Linux workspace | Managed tool installation/versioning and image/audio generation |
| Notifications | Durable in-app inbox, source-linked change alerts, restart reconciliation | APNs/FCM/device push delivery |
| Localization | English and Simplified Chinese (灵悟) UI, runtime language switcher, persisted preference, localized dates/times and domain labels | Additional locales; server-generated content remains in the server's language (see [I18N.md](I18N.md)) |
| User accounts | Supabase email sign-up/sign-in, verification-code sign-in (Supabase email OTP), standard JWT sessions with configurable TTL, multi-device session list and remote sign-out, IP + account sign-in rate limiting, per-account audit logs, per-account private workspace; falls back to one shared access key when Supabase is unset | Password reset, roles, third-party OAuth |
| Connectors | Searchable capability/status catalogue, Google connection, browser worker | Plaid, health, Instagram, WhatsApp and partner APIs |
| OpenBot | Disabled adapter with pinned protocol/identity tests | Live session bridge, routines and computer backend wiring |

The Linux computer is disabled until configured on the server and has no network access. It is a single-owner container with a persistent `/workspace`, separate from the browser worker; see [computer setup and limits](COMPUTER.md). It is not a graphical desktop or a full OS VM.

With the `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` trio set, the server runs email accounts instead of the shared `LINGWU_ACCESS_KEY`. Sign-up, sign-in and verification-code sign-in are proxied through Supabase; the server then issues its own standard JWT session (configurable TTL via `SESSION_TTL_MS`, default 7 days), so later requests do not call Supabase again. Sessions are tracked server-side so a user can list and remotely revoke their other devices, and sign-in is rate-limited by both client IP and account to blunt brute force. Supabase also stores the audit log (`lingwu_audit_logs`) and a resource index (`lingwu_resources`) with row-level security, while business data stays in the LingWu database, namespaced by account id so threads, ideas, goals, notifications and file metadata are private to one account.

Sandbox isolation is per account: the browser worker creates an isolated Chromium profile per session, and the optional Linux computer runs in its own container or E2B Desktop sandbox per owner, so accounts on the same server do not share browser state or computer containers.

Model chat can read the connected primary calendar for an explicit time range of up to 366 days. Missing dates or time zones need clarification. A reply uses at most 20 events and bounded event text; partial results and connection failures are reported. All-day dates keep their calendar time zone and exclusive end date. Calendar changes still require action review. The sample agent's canned replies do not provide this model tool.

Chat and delegated tasks resolve the user's model connection first and fall back to the deployment `MODEL`, written as `provider/model-id`. Deployment providers include OpenAI, Anthropic, Google, DeepSeek and Moonshot. DeepSeek and Moonshot have separate server-only keys (`DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`) and endpoints. Provider keys stay on the server and never reach the app or the computer sandbox.

My → Settings contains Model connection with linked provider/model dropdowns and a write-only API Key (DeepSeek first). The workbench and chat composers have a compact configured-model dropdown that displays the current model label (for example DeepSeek-Flash). Provider endpoints and model parameters come from a shared server catalogue; users cannot override them. The key is encrypted with `TOKEN_ENCRYPTION_KEY` and stored under the authenticated owner and provider, together with a model ID reference. Testing reads the provider's model directory without saving or generating content; saving validates that directory before enabling the connection. Chat turns and delegated model tasks resolve the owner's credentials at execution time. Personal settings override deployment defaults, and removing them restores the deployment default. Redirects are refused.

Configured-model pickers combine the current owner's saved personal providers and providers with a server key; personal credentials take precedence for the same provider. Selections are saved per owner and never mutate the deployment's shared `MODEL`. A saved server-provider selection is ignored if its key has been removed. Each provider offers a short curated list, and a hand-written `.env` model stays selectable. Sample and AG-UI backends do not allow personal model connections or model switching. See [personal model connections](USER-MODEL-CONNECTION.md).

The implementation and validation details are in [VERIFICATION.md](VERIFICATION.md). Planned extensions are not claims of current support. Priorities are tracked in the [roadmap](../ROADMAP.md).
