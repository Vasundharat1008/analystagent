# InsightAI — AI Business Analyst Agent

## Problem
Business teams sit on raw CSV exports without the time or expertise to turn them into executive-level decisions.

## Solution
InsightAI is an AI-powered Data Storytelling & Reasoning Agent. Upload a CSV and instantly get:
- Dataset overview, health score, and quality analysis
- Auto-generated charts
- AI Analyst Report (summary, findings, risks, opportunities, recommendations, impact, action plan)
- Reasoning chat with visible Agent Thinking Process
- Strategic Action Plan with prioritised roadmap
- What-If Scenario Simulator for impact estimation
- One-click Executive Report download

## Tech Stack
- React 19 + TypeScript
- TanStack Start (server functions keep API keys server-side)
- Tailwind v4 + shadcn/ui (dark blue/purple gradient UI)
- Recharts for visualisations
- PapaParse for CSV parsing
- OpenRouter API for AI reasoning

## How the AI Agent Works
1. CSV is parsed and analysed **in the browser** — raw data never leaves the user's device.
2. Only summarised metadata (column stats, top values, missing/duplicate counts) is sent server-side.
3. A TanStack server function calls OpenRouter with the secret API key.
4. The agent returns structured JSON which is rendered as report, chat answer, plan, or scenario.

## OpenRouter Setup
Set up to 5 API keys for automatic fallback:
- `OPENROUTER_API_KEY_1` … `OPENROUTER_API_KEY_5`
- `OPENROUTER_MODEL` (defaults to a free model)

The server tries each key in order; if a key is rate-limited or fails, the next is tried automatically. If all keys fail, InsightAI falls back to local rule-based analysis.

## Run Locally
```
bun install
bun run dev
```

## Hackathon Judging Alignment
- **Accuracy & Relevance** — analysis is grounded in the dataset's actual statistics.
- **Reasoning & Multi-step Thinking** — visible Agent Thinking Process.
- **Creativity** — What-If Scenario Simulator.
- **User Experience** — clean dashboard, smooth chat, polished export.
- **Reliability & Safety** — 5-key fallback, local fallback, metadata-only AI calls.

## Future Scope
- Multi-file joins and time-series forecasting
- Saved sessions and team collaboration
- Native PDF export
- Custom KPI definitions and alerting
