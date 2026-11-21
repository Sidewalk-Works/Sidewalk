# Package Boundaries — Description

## Overview

Sidewalk is a modular monorepo. Each package/app has a defined boundary.
Respecting these boundaries keeps the codebase maintainable as new civic
modules are added.

## Package Map

```
packages/
  shared/     → types, schemas, constants — used by web/mobile (and as contracts where applicable)
  stellar/    → Stellar SDK helpers — imported by apps that need Stellar integration

apps/
  api/        → FastAPI backend — source of truth for API behavior and data
  web/        → Next.js frontend — calls API over HTTP
  mobile/     → Expo/React Native app — calls API over HTTP
```

## What Belongs Where

- Shared type? → `packages/shared`
- Stellar contract call? → `packages/stellar`
- HTTP route handler? → `apps/api`
- Page or component? → `apps/web` or `apps/mobile`
- Business rule? → `apps/api` service layer

## Detecting Violations

```bash
pnpm lint   # ESLint no-restricted-imports rules catch disallowed cross-package imports
```
