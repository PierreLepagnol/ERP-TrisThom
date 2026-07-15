# ERPTrisThom — Setup Guide (Newbie, Step by Step)

Stack: Bun + Turborepo monorepo, Convex backend, TanStack Start web app, shared shadcn/ui.

Works the same on Linux, macOS, and Windows — Bun is cross-platform. On Windows, run these in **PowerShell** or **WSL**; the commands themselves don't change.

## 0. Prerequisites

- **Git** — https://git-scm.com/downloads
- **Bun** (package manager + runtime, replaces npm/node here)
  - Linux/macOS: `curl -fsSL https://bun.sh/install | bash`
  - Windows (PowerShell): `powershell -c "irm bun.sh/install.ps1 | iex"`
  - Verify: `bun --version` (this repo pins `1.3.9` via `packageManager` in package.json)
- A free **Convex** account (https://convex.dev) — you'll create it interactively in step 2, no need to sign up beforehand.

## 1. Clone and install

```bash
git clone <repo-url>
cd ERPTrisThom
bun install
```

This installs dependencies for every workspace (`apps/web`, `packages/backend`, `packages/ui`, `packages/env`, `packages/config`) in one shot.

## 2. Set up Convex (backend)

```bash
bun run dev:setup
```

This runs `convex dev --configure --until-success` inside `packages/backend`. It will:
- open your browser to log in / create a Convex account
- ask you to create a new Convex project
- write `packages/backend/.env.local` with your project's deploy key and URLs

Leave this terminal once it finishes configuring (it may keep running `convex dev` — that's fine, or `Ctrl+C` and start everything together in step 4).

## 3. Copy env vars to the web app

`apps/web/.env` already exists in this repo pointing at an existing Convex deployment. If you created your **own** Convex project in step 2, copy the new values over:

```bash
cat packages/backend/.env.local
```

Copy `CONVEX_URL` / site URL values into `apps/web/.env` as:

```
VITE_CONVEX_URL=<your convex cloud url>
VITE_CONVEX_SITE_URL=<your convex site url>
```

## 4. Run everything

```bash
bun run dev
```

This starts both the Convex dev server and the web app via Turborepo. Open:

```
http://localhost:3001
```

## Other useful commands

| Command | What it does |
|---|---|
| `bun run dev:web` | Start only the web app |
| `bun run dev:server` | Start only the Convex backend |
| `bun run build` | Build all apps |
| `bun run check-types` | Type-check everything |
