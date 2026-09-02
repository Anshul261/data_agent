# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
uv run pytest tests/           # Run backend tests
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
- **State management**: Zustand store with localStorage persistence for sessions, messages, and settings
- **Component library**: shadcn/ui components in `src/components/ui/`
- **Agent safety**: ClickHouse queries are validated to be read-only (SELECT statements only)

## Technology Stack

**Frontend**: Next.js 15, React 18, TypeScript, Tailwind CSS 3.4, Zustand, Radix UI, Framer Motion

**Backend**: Python 3.12, FastAPI, Agno 2.3.2+, Azure OpenAI, ClickHouse Connect, SQLAlchemy
