# Sidewalk

**Sidewalk** is a civic engagement platform that enables citizens to report local issues, track public cases, and build trust between communities and institutions through transparent reporting and verification workflows.

The platform helps people document problems in their neighborhoods, submit reports, monitor progress, and access public information about issues affecting their communities. By combining identity, reporting, and verification systems, Sidewalk aims to create a more accountable and responsive civic ecosystem.

Built across web, mobile, and backend services, Sidewalk is designed to support both everyday citizens and organizations responsible for resolving reported issues.

---

# Overview

Many civic issues go unresolved because there is no reliable system for reporting, tracking, and verifying them.

Citizens often submit complaints through fragmented channels with little visibility into what happens afterward. Local governments, organizations, and communities frequently lack a transparent mechanism for demonstrating progress or maintaining trust.

Sidewalk addresses these challenges by providing:

* structured issue reporting,
* citizen identity and trust systems,
* public case tracking,
* verification workflows,
* notifications and updates,
* transparent civic engagement tools.

The platform creates a shared space where reports can be submitted, monitored, verified, and resolved with greater accountability.

---

# Core Features

## Civic Reporting

Citizens can report issues affecting their communities through a structured reporting workflow.

Examples include:

* damaged roads,
* waste management issues,
* broken public infrastructure,
* environmental concerns,
* utility disruptions,
* community safety concerns,
* public service complaints.

Reports can include supporting information, media, location data, and categorization to improve visibility and response.

---

## Identity & Trust

Trust is critical in civic systems.

Sidewalk includes identity workflows that help establish credibility while protecting users from unnecessary complexity.

Identity features may include:

* user verification,
* profile management,
* trust indicators,
* contribution history,
* reputation signals,
* reporting history.

These systems help reduce abuse while increasing confidence in submitted reports.

---

## Public Case Tracking

Transparency is one of the platform's core goals.

Users can track the status of reports throughout their lifecycle.

Potential report states include:

* submitted,
* under review,
* verified,
* assigned,
* in progress,
* resolved,
* closed.

This provides visibility into what actions are being taken after a report is submitted.

---

## Notifications & Updates

Sidewalk keeps users informed as cases evolve.

Notifications may include:

* report status changes,
* verification updates,
* moderator actions,
* community engagement activity,
* resolution confirmations.

This ensures users remain connected to issues they care about.

---

## Moderation & Administration

The platform includes operational tools for maintaining data quality and platform integrity.

Administrative capabilities may include:

* report review,
* moderation workflows,
* abuse prevention,
* verification management,
* case escalation,
* operational analytics.

These tools help maintain trust and ensure the platform remains useful for communities.

---

## Stellar-Powered Verification

Sidewalk uses Stellar as a trust and verification layer rather than a traditional payment system.

The Stellar integration can be used for:

* verification receipts,
* proof of report submission,
* proof of verification events,
* auditability,
* trust signals,
* transparent record tracking.

By anchoring key events to Stellar, Sidewalk can provide stronger guarantees around authenticity and transparency while keeping the user experience simple.

---

# Technology Stack

| Area               | Technology                       |
| ------------------ | -------------------------------- |
| Web Application    | Next.js + React + TypeScript     |
| Mobile Application | Expo + React Native + TypeScript |
| Backend API        | FastAPI + Python                 |
| Blockchain Layer   | Stellar                          |
| Package Management | pnpm                             |
| Architecture       | Monorepo                         |

---

# Repository Structure

```text
sidewalk/
│
├── apps/
│   ├── api/        # Backend API (FastAPI modular monolith)
│   ├── web/        # Web authentication UI (Next.js)
│   └── mobile/     # Mobile foundation (Expo + React Native)
│
├── packages/
│   ├── shared/      # Shared TypeScript types and validation schemas
│   └── stellar/     # Stellar integration scaffold (no blockchain logic yet)
│
└── docs/            # Environment, testing, and contributor documentation
```

This is the foundational, hackathon-ready starting point for Sidewalk: a
modular monolith FastAPI backend, matching web and mobile foundations, and
the package/CI/docs scaffolding needed to start building the rest of the
platform described above.

---

# Applications

## API

`apps/api`

The API is a **modular monolith** built with FastAPI and Python (3.12+). It is
organized by business domain (`src/modules/auth`, `src/modules/users`, `src/modules/reports`, `src/modules/cases`, `src/modules/notifications`, `src/modules/moderation`), with cross-cutting infrastructure and middleware in `src/core`.

Currently implemented:

* account registration, login, and JWT access-token issuance,
* user profiles and authenticated current user dependencies,
* civic issue reporting (creation, retrieval, status management, location, and metadata),
* public case tracking, pagination, and follow/unfollow capabilities,
* in-app notifications with read-state tracking and unread counts,
* report moderation workflows (flagging, review transitions, and status updates),
* structured logging with correlation IDs, slowapi rate limiting, security headers, and CORS,
* health check and system information endpoints.

Data persistence is managed via SQLAlchemy 2.0 (asyncio) and Alembic migrations, supporting SQLite for local testing and PostgreSQL for development and production.

---

## Web Application

`apps/web`

The web app is a Next.js (App Router) application providing the authentication
UI:

* Login page (`/`),
* Create Account page (`/register`),
* client-side auth state management (token stored in `localStorage`).

No other pages exist yet — additional product surfaces from the roadmap below
will be built as new modules on top of this foundation.

---

## Mobile Application

`apps/mobile`

The mobile app is an Expo + React Native + TypeScript foundation: project
setup, folder structure (`src/components`, `src/screens`, `src/navigation`,
`src/hooks`, `src/services`, `src/utils`, `src/assets`), linting, formatting,
and a working test setup. No screens or authentication flows are implemented
yet — this is a starting point for future development.

---

## Stellar Package

`packages/stellar`

A scaffold package for the future Stellar integration described in the
[Vision](#vision) section. It currently contains only placeholder types and
interfaces with no blockchain functionality, so the package compiles and is
ready for future implementation.

---

# Product Roadmap

The current platform roadmap follows this progression:

1. Authentication.
2. Identity and user profiles.
3. Civic reporting workflows.
4. Public case tracking.
5. Stellar-backed verification and receipts.
6. Notifications and trust signals.
7. Moderation and administration.
8. Offline and resilience features.
9. Observability, security, and production readiness.

Each phase builds upon the previous one to create a complete civic engagement ecosystem.

---

# Getting Started

## Requirements

* Python 3.12+ with [uv](https://github.com/astral-sh/uv)
* Node.js 20+
* pnpm 10+
* Docker & Docker Compose (optional, for local PostgreSQL)

### Backend API Setup

```bash
cd apps/api
uv sync --extra dev
cp .env.example .env   # fill in values
docker-compose up -d   # optional: start local PostgreSQL
uv run alembic upgrade head
uv run uvicorn src.main:app --reload
```

The interactive OpenAPI docs are available at `http://localhost:8000/docs`.

### Frontend & Mobile Setup

From the repository root:

Install web/mobile dependencies:

```bash
pnpm install
```

Run frontend applications:

```bash
pnpm dev:web
pnpm dev:mobile
```

Once the API and web app are running, visit `http://localhost:3000` to create
an account and log in.

---

# Quality Checks

### Backend (Python / FastAPI)

Run code quality and test checks from `apps/api`:

```bash
cd apps/api
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/
uv run alembic check
uv run pytest --cov=src --cov-fail-under=80
```

### Frontend & Shared Packages

Run validation checks from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

---

# Environment Configuration

Each application includes an example environment file:

```text
apps/api/.env.example
apps/web/.env.example
apps/mobile/.env.example
```

Copy the appropriate file and configure environment variables before running
services locally. See [docs/environment.md](docs/environment.md) for details
on each variable and secrets handling.

---

# Documentation

* [Environment Setup](docs/environment.md)
* [Testing Guide](docs/testing.md)
* [Contributor Guide](docs/contributing.md)

---

# Vision

Sidewalk's long-term goal is to create a trusted civic infrastructure layer where communities can report issues, verify information, monitor progress, and hold institutions accountable through transparent and verifiable workflows.

By combining reporting systems, identity, public tracking, and Stellar-backed verification, Sidewalk aims to strengthen trust between citizens, organizations, and public institutions.

---

# License

MIT
