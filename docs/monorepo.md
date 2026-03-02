# Monorepo Blueprint (pnpm + Turbo)

This repo currently runs as a single Electron app. If you want to split it into a monorepo, use the layout below.

```
automation-console/
  apps/
    desktop/                # Electron + React (this app)
      src/
      electron.vite.config.ts
      package.json
  packages/
    core/                   # Engine, scheduler, adapters, db
      src/
      package.json
    shared/                 # Types + IPC contracts
      src/
      package.json
    ui/                     # Shared UI components
      src/
      package.json
  tools/
    scripts/                # Repo scripts (migrations, seeders)
  .github/
    workflows/
  turbo.json
  pnpm-workspace.yaml
  package.json
```

Suggested workspaces:
- `apps/desktop`: Electron shell + renderer
- `packages/core`: DB + engine + adapters
- `packages/shared`: TypeScript types + IPC contracts
- `packages/ui`: Reusable UI primitives

Turbo pipeline sample:
```
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", "out/**"] },
    "test": { "dependsOn": ["^test"], "outputs": [] },
    "lint": { "dependsOn": ["^lint"], "outputs": [] }
  }
}
```

Bootstrap (monorepo mode):
```
pnpm install
pnpm -r build
pnpm -r test
```
