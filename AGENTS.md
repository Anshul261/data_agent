# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Full-stack AI-powered ticket analytics application with a Next.js frontend and Python agent backend powered by Azure OpenAI.

## Commands

### Frontend (agent-ui/)

```bash
cd agent-ui
npm run dev           # Start dev server on port 3000
npm run build         # Production build
npm run lint          # ESLint check
npm run lint:fix      # Fix lint issues
npm run format        # Check Prettier formatting
npm run format:fix    # Apply Prettier formatting
npm run typecheck     # TypeScript type checking
npm run validate      # Run all checks (lint + format + typecheck)
```

### Backend (agent/)

```bash
# Uses uv for dependency management
uv run python agent/agent.py   # Start agent server on port 7777

# Sandbox-friendly syntax check
.venv/bin/python -m py_compile agent/agent.py agent/auth.py
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js 15 Frontend (agent-ui/)                        │
│  └─ React 18 + TypeScript + Tailwind + Zustand          │
│                                                         │
│  Key directories:                                       │
│  • src/components/chat/ - Chat UI (Sidebar, Messages)   │
│  • src/hooks/ - Custom hooks for streaming & sessions   │
│  • src/api/os.ts - API client for AgentOS endpoints     │
│  • src/store.ts - Zustand global state with persistence │
└─────────────────────────────────────────────────────────┘
                          │ SSE (streaming)
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Python Agent Backend (agent/agent.py)                  │
│  └─ FastAPI + Agno framework + Azure OpenAI             │
│                                                         │
│  Agent tools:                                           │
│  • execute_clickhouse_query() - Run read-only SQL       │
│  • list_tables() - Get available tables                 │
│  • get_table_schema() - Inspect table structure         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────┬──────────────────┬──────────────────┐
│    ClickHouse    │    PostgreSQL    │      SQLite      │
│   (analytics)    │   (knowledge)    │   (agent cache)  │
└──────────────────┴──────────────────┴──────────────────┘
```

## Key Patterns

- **Real-time streaming**: Agent responses use Server-Sent Events (SSE) via custom hooks (`useAIStreamHandler`, `useAIResponseStream`)
- **State management**: Zustand store persists only non-sensitive frontend settings such as the selected endpoint. Do not persist JWT bearer tokens, usernames, or roles in localStorage.
- **Component library**: shadcn/ui components in `src/components/ui/`
- **Agent safety**: ClickHouse queries are validated as single read-only statements, restricted to the allowed table/view, and executed with ClickHouse readonly settings.
- **Dashboard safety**: Saved dashboard cards store SQL and rerun it server-side after validation. Dashboard refresh has a separate result-row setting from interactive agent calls.
- **Apache ECharts rendering**: Interactive charts are rendered in the frontend via `echarts-for-react` and the local json-render registry, not by asking the model for HTML/CSS.
- **Artifact-first UX**: Agent chart/dashboard responses should include fenced `chart-artifact` or `json-render` blocks exactly as returned by `VisualizationTools`.

## Deployment Security Contract

This codebase is being prepared for pilot/production deployment. Preserve these boundaries when making changes.

### Authentication and Authorization

- Backend auth lives in `agent/agent.py` and `agent/auth.py`.
- Local credentials are stored in PostgreSQL in the `users` table with bcrypt password hashes.
- Passwords must be 12-72 bytes. Bcrypt truncates after 72 bytes, so do not raise the backend max without changing the hashing strategy.
- JWTs are issued by `/auth/login` and validated by Agno `JWTMiddleware`.
- Tokens include explicit scopes:
  - Admin: `agent_os:admin`, `agents:read`, `agents:run`, `sessions:read`, `sessions:write`, `dashboards:read`, `dashboards:write`, `knowledge:write`
  - User: `agents:read`, `agents:run`, `sessions:read`, `sessions:write`, `dashboards:read`, `dashboards:write`
- Custom endpoints must call `_require_scope()` before returning or mutating user-owned resources.
- Knowledge mutation endpoints (`/api/knowledge/load`, `DELETE /api/knowledge`) require `knowledge:write`.
- Dashboard endpoints require `dashboards:read` or `dashboards:write` and must filter by `owner_user_id`.
- `/auth/bootstrap` creates the first admin only. In production (`APP_ENV=production`), it requires `AUTH_BOOTSTRAP_KEY`.
- `/auth/recover` is disabled unless `AUTH_RECOVERY_KEY` is set and does not reset admin accounts.
- Auth endpoints are rate-limited in-process by `LOGIN_RATE_LIMIT_PER_MINUTE`. This is useful for a single process, but a production multi-replica deployment should use an external/shared rate limiter at the proxy or gateway.

### Frontend Token Handling

- The frontend must pass JWTs in the `Authorization: Bearer <token>` header.
- Do not persist auth tokens in localStorage, sessionStorage, IndexedDB, or URL query params.
- `agent-ui/src/store.ts` should persist only non-sensitive settings. Current expected persisted key: `selectedEndpoint`.
- If a future change moves to cookies, use `HttpOnly`, `Secure`, `SameSite=Lax` or stricter, and add CSRF protection for state-changing endpoints.

### Agent Guardrails

- The Agno agent is defined in `agent/agent.py`.
- Guardrails use Agno `pre_hooks`:
  - `PromptInjectionGuardrail()`
  - `PIIDetectionGuardrail(mask_pii=True)`
- Keep these guardrails present unless replacing them with a stronger documented Agno guardrail strategy.
- Agent instructions must continue to refuse:
  - system prompt or hidden instruction disclosure
  - JWT, recovery key, connection string, credential, or secret disclosure
  - bypassing access controls
  - mutating/admin SQL or data modification
  - broad raw data dumps when focused aggregate queries are appropriate
- `AGENT_TOOL_CALL_LIMIT` bounds how many tool calls the agent can make in one run. Prefer focused follow-up queries over one huge query.

### ClickHouse and SQL Safety

- ClickHouse access is intentionally limited to `CLICKHOUSE_ALLOWED_TABLE` (default `LLM_access_tickets`), resolved to a real database-qualified table/view at startup.
- SQL validation must remain centralized through `_validate_read_only_query()` and `_validate_dashboard_query()`.
- Queries must remain:
  - single statement only
  - read-only only
  - blocked from mutating/admin keywords
  - blocked from `FORMAT ...`
  - blocked from `INTO OUTFILE`
  - restricted to the allowed table/view for `FROM`, `JOIN`, and `DESCRIBE`
- ClickHouse calls should include `readonly: 1`.
- Interactive agent result rows are controlled by `AGENT_CLICKHOUSE_MAX_RESULT_ROWS` so the model does not ingest large raw datasets.
- Saved dashboard refresh result rows are controlled separately by `DASHBOARD_CLICKHOUSE_MAX_RESULT_ROWS`.
  - `0` means no backend row cap for dashboard refresh.
  - Keep dashboard SQL validated even when uncapped.
- `CLICKHOUSE_MAX_EXECUTION_TIME` protects both interactive and dashboard queries from runaway execution.
- The row limits cap returned result rows, not source rows scanned by ClickHouse. Aggregations over 6+ months of data are expected to work.
- In production, ClickHouse TLS defaults to enabled through `CLICKHOUSE_SECURE=true` and `CLICKHOUSE_VERIFY_TLS=true`.

### Dashboard Query Pattern

- Dashboards should be generated from aggregate SQL, not raw `SELECT *` dumps.
- Preferred card patterns:
  - Metrics: one row.
  - Time series: one row per bucket.
  - Bar/pie/category charts: top-N or grouped rows.
  - Tables: bounded operational drilldowns unless explicitly intended as large production tables.
- Saved dashboard refresh reruns stored SQL directly against ClickHouse after validation.
- If users need large exports, add a separate audited export endpoint with stricter permissions instead of sending huge raw data through the agent chat path.

## Agent and UI Functionality Contract

### Visualization Tools and Artifacts

- Visualization tools live in `agent/tools/viz.py` and are registered on the Agno agent as `viz_tools`.
- Prefer UI-rendered artifacts over PNG charts:
  - Use `create_json_render_artifact()` for dashboards, reports, PDF-ready layouts, or multiple visual components.
  - Use `create_chart_artifact()` for a single standalone chart or table.
  - Use PNG helpers (`create_bar_chart`, `create_line_chart`, etc.) only when an actual image is explicitly requested or artifact rendering is unsuitable.
- The agent response must include the returned fenced block unchanged:
  - ` ```json-render ... ``` `
  - ` ```chart-artifact ... ``` `
- Do not rewrite, summarize, or manually edit JSON inside these fenced blocks after the tool returns it.
- Artifact chart types are intentionally limited to:
  - `metric`
  - `line`
  - `bar`
  - `pie`
  - `table`
- Every chart/dashboard card should include:
  - `title`
  - `chart_type`
  - `data`
  - `mapping`
  - `query.sql`
  - `query.explanation`
  - `insight`
  - `presentation`
- Include SQL in each card query so saved dashboards can be refreshed later.
- Keep card data shaped as rows (`list[dict]`) with stable field names. Do not return chart data as arbitrary prose.

### Apache ECharts and Json-Render UI

- The json-render catalog is defined in `agent-ui/src/components/render/catalog.ts`.
- The render registry is defined in `agent-ui/src/components/render/registry.tsx`.
- Apache ECharts rendering uses `echarts-for-react`.
- Supported json-render component types are:
  - `Dashboard`
  - `Report`
  - `Section`
  - `Grid`
  - `Card`
  - `Metric`
  - `EChart`
  - `DataTable`
  - `Insight`
  - `MarkdownText`
  - `Divider`
  - `PageBreak`
- Do not invent new json-render component names unless you also update the catalog, registry, types, and agent instructions together.
- ECharts components support `line`, `bar`, and `pie` via `EChart`.
- `metric` cards render through `Metric`.
- `table` cards render through `DataTable`.
- Artifact parsing and hydration helpers live in:
  - `agent-ui/src/lib/chartArtifacts.ts`
  - `agent-ui/src/lib/renderArtifacts.ts`
- Malformed artifact blocks should not break the chat UI. Keep parser behavior defensive.

### Dashboard View

- The saved dashboard view lives in `agent-ui/src/app/dashboards/page.tsx`.
- Dashboard save actions are triggered from rendered artifacts in:
  - `agent-ui/src/components/render/JsonRenderArtifactGroup.tsx`
  - `agent-ui/src/components/chat/ChatArea/Messages/DashboardArtifactGroup.tsx`
- Dashboard API client functions live in `agent-ui/src/api/os.ts`:
  - `createDashboardAPI`
  - `listDashboardsAPI`
  - `getDashboardAPI`
  - `refreshDashboardAPI`
- Dashboard backend endpoints live in `agent/agent.py`:
  - `POST /api/dashboards`
  - `GET /api/dashboards`
  - `GET /api/dashboards/{dashboard_id}`
  - `POST /api/dashboards/{dashboard_id}/refresh`
- Dashboard persistence lives in `agent/dashboard_store.py`.
- Saved dashboards are owned by `owner_user_id`. Never expose dashboards across users unless explicit team/shared-dashboard authorization is added.
- Dashboard refresh reruns each saved card's SQL after `_validate_dashboard_query()`.
- Dashboard refresh may return uncapped results when `DASHBOARD_CLICKHOUSE_MAX_RESULT_ROWS=0`; this is intended for production dashboards but can affect browser rendering if a table is extremely large.
- If adding dashboard sharing, exports, delete, rename, or scheduling, add explicit authorization checks and keep auditability in mind.

### Knowledge Base Management

- Knowledge base mode is controlled by `ENABLE_KNOWLEDGE_BASE`.
- Knowledge uses PostgreSQL/pgvector via Agno `Knowledge`, `PgVector`, and `PostgresDb`.
- Curated source files live under `agent/knowledge/`:
  - `tables/`
  - `business/`
  - `queries/`
- `/api/knowledge/load` currently embeds the table metadata and business JSON files. Raw `.sql` files are intentionally not embedded directly; the query catalog should represent validated query patterns.
- `/api/knowledge/load` and `DELETE /api/knowledge` are admin-only via `knowledge:write`.
- The settings page exposes knowledge load/clear controls only for admin users:
  - `agent-ui/src/app/settings/page.tsx`
- Keep knowledge management operationally explicit. Do not automatically clear or reload production knowledge as part of normal user chat.
- If adding new knowledge files, prefer structured JSON with business meaning, table semantics, validated metrics, and safe query patterns over raw free-form notes.
- If changing embedded knowledge contents, verify startup behavior when `ENABLE_KNOWLEDGE_BASE=true` and when it is `false`.

### Chat and Session Flow

- Main chat page: `agent-ui/src/app/page.tsx`.
- Chat UI: `agent-ui/src/components/chat/`.
- Streaming request orchestration: `agent-ui/src/hooks/useAIStreamHandler.tsx`.
- Stream parsing: `agent-ui/src/hooks/useAIResponseStream.tsx`.
- Session loading/deletion: `agent-ui/src/hooks/useSessionLoader.tsx`, `agent-ui/src/components/chat/Sidebar/Sessions/`.
- The frontend sends `stream=true` and `session_id` in `FormData` for agent runs.
- Keep `Authorization: Bearer <token>` attached to AgentOS and custom API calls.
- When changing AgentOS route usage, update `agent-ui/src/api/routes.ts` and all callers together.

### Settings and Admin UI

- Settings page: `agent-ui/src/app/settings/page.tsx`.
- Settings currently manages:
  - selected backend endpoint
  - connection refresh
  - logout
  - admin-only knowledge load/clear
- Endpoint persistence is allowed because it is non-sensitive.
- Do not reintroduce editable raw token storage in the sidebar/settings for production use.
- Admin-only UI controls are convenience checks; backend scopes are the real authorization boundary.

### HTTP and Endpoint Security

- `agent/agent.py` adds security headers middleware:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
  - `Strict-Transport-Security` for HTTPS or production
- HSTS should only be active behind real HTTPS. Browsers cache HSTS for the domain.
- CORS must be explicit in production:
  - `APP_ENV=production`
  - `CORS_ALLOWED_ORIGINS=https://your-frontend-domain.example`
- Do not use wildcard CORS with credentials.
- Public unauthenticated routes should stay minimal. Currently expected public routes include health/docs, chart image serving, and auth bootstrap/login/recovery.

### Important Environment Variables

```bash
APP_ENV=production
JWT_SECRET=<64+ character random secret for HS algorithms>
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=8
AUTH_BOOTSTRAP_KEY=<required in production for first admin>
AUTH_RECOVERY_KEY=<optional; enables non-admin password recovery>
CORS_ALLOWED_ORIGINS=https://your-frontend-domain.example

AZURE_POSTGRES_URL=<postgres connection string>

CLICKHOUSE_HOST=<host>
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=<least-privileged read-only user>
CLICKHOUSE_PASSWORD=<secret>
CLICKHOUSE_DATABASE=<database>
CLICKHOUSE_ALLOWED_TABLE=LLM_access_tickets
CLICKHOUSE_SECURE=true
CLICKHOUSE_VERIFY_TLS=true
CLICKHOUSE_MAX_EXECUTION_TIME=60
AGENT_CLICKHOUSE_MAX_RESULT_ROWS=5000
DASHBOARD_CLICKHOUSE_MAX_RESULT_ROWS=0
AGENT_TOOL_CALL_LIMIT=12

AGNO_DEBUG=false
AGNO_TELEMETRY=false
ENABLE_KNOWLEDGE_BASE=true
```

### Verification Expectations

Before handing off security-sensitive backend changes, run:

```bash
.venv/bin/python -m py_compile agent/agent.py agent/auth.py
```

Before handing off frontend changes, run:

```bash
cd agent-ui
npm run typecheck
npm run lint
```

`npm run format` may report existing unrelated Prettier issues. If formatting only touched files, prefer targeted checks such as:

```bash
npx prettier --check src/app/login/page.tsx src/store.ts
```

Do not format or rewrite unrelated files just to satisfy repo-wide formatting unless explicitly asked.

## Technology Stack

**Frontend**: Next.js 15, React 18, TypeScript, Tailwind CSS 3.4, Zustand, Radix UI, Framer Motion

**Backend**: Python 3.12, FastAPI, Agno 2.3.2+, Azure OpenAI, ClickHouse Connect, SQLAlchemy
