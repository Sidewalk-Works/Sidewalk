#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_BACKLOG_PATH = path.resolve("backlog/sidewalk-backlog.local.md");

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  }).trim();
}

function parseArgs(argv) {
  const args = {
    backlogPath: DEFAULT_BACKLOG_PATH,
    count: 0,
    start: null,
    publish: false,
    writeBacklog: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--publish") args.publish = true;
    else if (token === "--write-backlog") args.writeBacklog = true;
    else if (token === "--count") args.count = Number(argv[++i]);
    else if (token === "--start") args.start = Number(argv[++i]);
    else if (token === "--backlog-path") args.backlogPath = path.resolve(argv[++i]);
    else if (token === "--repo") args.repo = argv[++i];
    else if (token === "--help" || token === "-h") args.help = true;
  }

  return args;
}

function parseRepoFromRemote(remoteUrl) {
  const match =
    remoteUrl.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?$/) ??
    remoteUrl.match(/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?$/);

  if (!match?.groups) {
    throw new Error(`Could not parse GitHub repo from origin URL: ${remoteUrl}`);
  }

  return `${match.groups.owner}/${match.groups.repo}`;
}

function getRepo(args) {
  if (args.repo) return args.repo;
  return parseRepoFromRemote(run("git", ["remote", "get-url", "origin"]));
}

function getExistingMaxIssueNumber(repo) {
  const output = run("gh", [
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--limit",
    "1",
    "--json",
    "number"
  ]);
  const parsed = JSON.parse(output);
  return parsed[0]?.number ?? 0;
}

function ensureLabel(repo, name, color, description) {
  try {
    run("gh", ["api", `repos/${repo}/labels/${encodeURIComponent(name)}`]);
    return;
  } catch {
    run("gh", [
      "api",
      "--method",
      "POST",
      `repos/${repo}/labels`,
      "-f",
      `name=${name}`,
      "-f",
      `color=${color}`,
      "-f",
      `description=${description}`
    ]);
  }
}

function sprintColor(index) {
  const palette = ["BFD4F2", "A2E8C4", "F7C948", "F2B5D4", "C7B9FF"];
  return palette[index - 1] ?? "BFD4F2";
}

function buildSprint(theme) {
  const issues = [];

  for (const lane of theme.lanes) {
    for (const action of lane.actions) {
      for (const subject of lane.subjects) {
        issues.push({
          title: `${action} ${subject}`,
          area: lane.area,
          label: lane.label,
          lane: lane.name,
          body: [
            `Sprint theme: ${theme.title}`,
            `Workstream: ${lane.name}`,
            "",
            theme.summary,
            "",
            "Acceptance notes:",
            `- Deliver the ${lane.name.toLowerCase()} slice in a way that can be worked on independently.`,
            "- Keep the API, web, mobile, and shared-package boundaries aligned with the current monorepo shape.",
            "- Prefer small pull requests that can be reviewed in parallel."
          ].join("\n")
        });
      }
    }
  }

  return issues;
}

const sprintThemes = [
  {
    label: "sprint-1",
    title: "Foundation hardening and domain scaffolding",
    summary:
      "Tighten the auth-first starter into a stable base for report creation, identity, and shared data contracts.",
    lanes: [
      {
        name: "API boundary",
        area: "apps/api",
        label: "backend",
        actions: ["Define", "Implement", "Harden", "Document", "Verify"],
        subjects: [
          "the report domain module boundary for the future citizen issue pipeline",
          "the auth module seams so user identity can be reused by report features",
          "a public API contract for the next civic resource endpoints",
          "consistent request validation and error shapes across API modules",
          "the first report lifecycle model without coupling it to the web client"
        ]
      },
      {
        name: "Shared contracts",
        area: "packages/shared",
        label: "backend",
        actions: ["Model", "Extract", "Define", "Add", "Create"],
        subjects: [
          "the initial civic resource DTOs for reports, statuses, and user summaries",
          "reusable zod schemas for report submission and profile updates",
          "shared pagination and filter types for list-heavy civic workflows",
          "typed response envelopes for success and domain error payloads",
          "shared enums for report states, visibility, and moderation outcomes"
        ]
      },
      {
        name: "Persistence",
        area: "apps/api/prisma",
        label: "backend",
        actions: ["Design", "Add", "Model", "Prepare", "Verify"],
        subjects: [
          "the first relational schema additions for report drafts and submissions",
          "migration-safe fields for future assignment, moderation, and audit records",
          "media metadata so attachments can be introduced without a schema rewrite",
          "seed and reset helpers for a richer local development dataset",
          "indexing strategy notes for report lookup and timeline queries"
        ]
      },
      {
        name: "Developer workflow",
        area: "docs and tooling",
        label: "documentation",
        actions: ["Document", "Add", "Describe", "Clarify", "Write"],
        subjects: [
          "the repo bootstrap path for contributors who start from the auth starter",
          "a clear local reset workflow for SQLite, Prisma, and generated clients",
          "how new modules should be added under the modular monolith pattern",
          "the package boundary rules for shared, stellar, web, api, and mobile",
          "a contributor checklist for reviewing cross-package changes"
        ]
      },
      {
        name: "Test harness",
        area: "apps/api and apps/web",
        label: "backend",
        actions: ["Extend", "Add", "Create", "Harden", "Refine"],
        subjects: [
          "integration test helpers so new civic modules can be covered quickly",
          "contract tests for the shared auth and public user payloads",
          "baseline API tests for future report creation flows",
          "web test scaffolding for authenticated and unauthenticated states",
          "the test reset flow so new domain models do not leak state across runs"
        ]
      }
    ]
  },
  {
    label: "sprint-2",
    title: "Citizen reporting experience",
    summary:
      "Build the user-facing report submission and viewing workflow across web and mobile while keeping the API contract explicit.",
    lanes: [
      {
        name: "Web submission",
        area: "apps/web",
        label: "frontend-web",
        actions: ["Design", "Add", "Implement", "Surface", "Create"],
        subjects: [
          "the first report submission entry point in the Next.js app router",
          "a multi-step form shell for location, category, and description capture",
          "draft autosave behavior for long-form report entry",
          "attachment upload state and retry handling in the submission flow",
          "a post-submit confirmation path that links into report tracking"
        ]
      },
      {
        name: "Mobile capture",
        area: "apps/mobile",
        label: "frontend-mobile",
        actions: ["Lay out", "Build", "Add", "Create", "Wire in"],
        subjects: [
          "the native report compose experience around the current Expo scaffold",
          "camera and gallery attachment selection flows with safe fallbacks",
          "offline-friendly draft persistence for interrupted submissions",
          "a mobile-friendly location capture flow for report context",
          "a lightweight report preview screen before final submission"
        ]
      },
      {
        name: "Report API",
        area: "apps/api",
        label: "backend",
        actions: ["Add", "Implement", "Validate", "Return", "Harden"],
        subjects: [
          "create, draft, and retrieve endpoints for citizen reports",
          "ownership-aware access control for draft and submitted report records",
          "geolocation, category, and body length constraints at the API edge",
          "normalized report timelines for both web and mobile clients",
          "idempotent submission handling so retries do not duplicate records"
        ]
      },
      {
        name: "Attachments",
        area: "apps/api and apps/mobile",
        label: "backend",
        actions: ["Define", "Add", "Implement", "Support", "Harden"],
        subjects: [
          "attachment metadata and upload intent handling for report media",
          "server-side validation for image types, size limits, and count limits",
          "preview-safe signed access for newly attached media",
          "upload progress and failure recovery hooks for flaky networks",
          "removing and replacing attachments before final publish"
        ]
      },
      {
        name: "Content quality",
        area: "shared and docs",
        label: "documentation",
        actions: ["Write", "Add", "Document", "Create", "Define"],
        subjects: [
          "form copy guidelines for civic reporting language and tone",
          "shared validation messages that match the reporting UX copy",
          "how accessibility should be preserved in long-form inputs",
          "empty-state guidance for first-time reporters",
          "the review criteria for a production-ready submission flow"
        ]
      }
    ]
  },
  {
    label: "sprint-3",
    title: "Public case tracking and discovery",
    summary:
      "Expose report status, maps, search, and lifecycle views so citizens can follow issues after submission.",
    lanes: [
      {
        name: "Discovery web",
        area: "apps/web",
        label: "frontend-web",
        actions: ["Build", "Create", "Add", "Refine", "Expose"],
        subjects: [
          "a public case list page for recent reports and updates",
          "a map discovery layout for geographic browsing of local issues",
          "status and category filters that can be combined without page reloads",
          "a report detail page that prioritizes timeline clarity over admin controls",
          "deep-link friendly share URLs for public report views"
        ]
      },
      {
        name: "Discovery API",
        area: "apps/api",
        label: "backend",
        actions: ["Implement", "Add", "Expose", "Support", "Return"],
        subjects: [
          "list and search endpoints for public report discovery",
          "pagination, sorting, and filter semantics for case browsing",
          "report summaries optimized for map markers and list cards",
          "public identifiers that can be shared without leaking private data",
          "timeline events in a stable order for status pages"
        ]
      },
      {
        name: "Lifecycle states",
        area: "apps/api and packages/shared",
        label: "backend",
        actions: ["Define", "Add", "Implement", "Create", "Document"],
        subjects: [
          "the report lifecycle state machine and transition guards",
          "shared status labels for submitted, verified, assigned, and resolved cases",
          "transition validation so invalid workflow jumps are rejected",
          "event records for each state change and important metadata update",
          "which transitions remain citizen-visible versus internal-only"
        ]
      },
      {
        name: "Mobile discovery",
        area: "apps/mobile",
        label: "frontend-mobile",
        actions: ["Create", "Add", "Implement", "Refine", "Make"],
        subjects: [
          "a mobile list view for the user’s submitted reports",
          "public case detail screens with compact timeline presentation",
          "location-aware search shortcuts for nearby issues",
          "pull-to-refresh and cached recent views for the discovery feed",
          "the detail page resilient to partial data while still feeling useful"
        ]
      },
      {
        name: "Search quality",
        area: "docs and shared",
        label: "documentation",
        actions: ["Document", "Define", "Add", "Write", "Capture"],
        subjects: [
          "ranking expectations for public case search and filtering",
          "which fields are searchable at launch and which remain internal",
          "shared test fixtures for common discovery states",
          "guidance for deduping nearly identical report titles",
          "acceptance criteria for map, list, and direct-link discovery"
        ]
      }
    ]
  },
  {
    label: "sprint-4",
    title: "Moderation and operations",
    summary:
      "Give operators queue, review, assignment, and analytics tooling that can be worked on independently across surfaces.",
    lanes: [
      {
        name: "Moderation queue",
        area: "apps/web",
        label: "frontend-web",
        actions: ["Build", "Add", "Create", "Implement", "Surface"],
        subjects: [
          "a queue view for suspicious, duplicate, and priority reports",
          "one-click moderation actions with confirmation states",
          "a report triage sidebar that keeps the primary case context visible",
          "batch selection for repetitive moderation decisions",
          "reviewer notes and history without exposing internal-only actions publicly"
        ]
      },
      {
        name: "Operations API",
        area: "apps/api",
        label: "backend",
        actions: ["Create", "Add", "Implement", "Harden", "Return"],
        subjects: [
          "moderation decision endpoints with explicit audit records",
          "assignment and ownership transfer operations for internal users",
          "internal search filters for queue triage and escalation",
          "rate-limit and abuse-prevention hooks around moderator actions",
          "operator-facing metrics for queue depth and aging"
        ]
      },
      {
        name: "Analytics",
        area: "apps/web and apps/api",
        label: "backend",
        actions: ["Build", "Add", "Create", "Show", "Add"],
        subjects: [
          "a lightweight operations dashboard for status and category trends",
          "SLA and aging summaries for unresolved civic cases",
          "exportable analytics payloads for CSV or dashboard rendering",
          "assignment and resolution throughput by period",
          "trend views that compare report volume across neighborhoods"
        ]
      },
      {
        name: "Safety",
        area: "shared and docs",
        label: "documentation",
        actions: ["Document", "Define", "Add", "Write", "Create"],
        subjects: [
          "moderation permission boundaries and escalation rules",
          "safe text handling expectations for public reports and notes",
          "abuse-case test fixtures for spam, duplicate, and hostile submissions",
          "guidance for auditability and operator accountability",
          "a reviewer checklist for queue and moderation changes"
        ]
      },
      {
        name: "Mobile ops",
        area: "apps/mobile",
        label: "frontend-mobile",
        actions: ["Add", "Create", "Implement", "Support", "Keep"],
        subjects: [
          "a compact status-review surface for internal mobile users",
          "mobile-safe queue summaries for on-the-go operators",
          "notifications for major moderation actions",
          "quick assignment or handoff actions from a native view",
          "internal tooling separate from the citizen-facing mobile flow"
        ]
      }
    ]
  },
  {
    label: "sprint-5",
    title: "Stellar verification and trust systems",
    summary:
      "Use Stellar as a verification and audit layer for civic events without turning the app into a payments product.",
    lanes: [
      {
        name: "Stellar service",
        area: "packages/stellar",
        label: "stellar",
        actions: ["Define", "Add", "Implement", "Create", "Document"],
        subjects: [
          "the verification event interface for the stellar integration package",
          "transaction mapping helpers for report submission and status proof records",
          "a minimal service wrapper for signing and verification primitives",
          "typed interfaces for receipt lookups and proof generation",
          "the exact responsibilities that remain outside the blockchain layer"
        ]
      },
      {
        name: "Verification API",
        area: "apps/api",
        label: "backend",
        actions: ["Add", "Store", "Validate", "Separate", "Return"],
        subjects: [
          "endpoints that mint verification receipts for report lifecycle events",
          "immutable proof references alongside civic state transitions",
          "verification payloads for public lookup",
          "internal verification actions from citizen-visible proof access",
          "audit-safe responses for proof creation and retrieval"
        ]
      },
      {
        name: "Trust UX",
        area: "apps/web and apps/mobile",
        label: "frontend-web",
        actions: ["Build", "Add", "Present", "Make", "Keep"],
        subjects: [
          "a public proof lookup page tied to report identifiers",
          "trust badges or verification receipts to report detail views",
          "verification history in a way that is understandable to citizens",
          "receipt sharing and copy-to-clipboard flows explicit and clear",
          "trust indicators lightweight so they do not overwhelm core reporting"
        ]
      },
      {
        name: "Auditability",
        area: "shared and docs",
        label: "documentation",
        actions: ["Define", "Add", "Document", "Create", "Spell out"],
        subjects: [
          "the audit payloads that must be preserved for verification actions",
          "shared types for proof status, source, and verification metadata",
          "the trust model in plain language for contributors",
          "tests around tamper detection and proof regeneration",
          "the difference between public proof and internal reconciliation"
        ]
      },
      {
        name: "Release readiness",
        area: "docs and tooling",
        label: "documentation",
        actions: ["Write", "Add", "Document", "Create", "Capture"],
        subjects: [
          "a launch checklist for enabling verification features by environment",
          "environment variable documentation for Stellar-related configuration",
          "fallback behavior when verification services are unavailable",
          "a demo script for the first verification milestone",
          "the operational runbook for proof errors and retries"
        ]
      }
    ]
  }
];

function buildBacklog({ startNumber }) {
  const lines = [
    "# Sidewalk Local Backlog",
    "",
    "This file is intentionally local-only and is generated from the current repository shape plus the current GitHub issue state.",
    "",
    `Configured start number: ${startNumber}`,
    ""
  ];

  let issueNumber = startNumber;
  for (const theme of sprintThemes) {
    const issues = buildSprint(theme);
    lines.push(`## ${theme.label} - ${theme.title}`);
    lines.push("");
    lines.push(theme.summary);
    lines.push("");

    for (const issue of issues) {
      lines.push(`- #${issueNumber} ${issue.title}`);
      lines.push(`  - labels: \`${theme.label}\`, \`${issue.label}\``);
      issueNumber += 1;
    }

    lines.push("");
  }

  return lines.join("\n");
}

function ensureSprintLabels(repo) {
  sprintThemes.forEach((theme, index) => {
    ensureLabel(
      repo,
      theme.label,
      sprintColor(index + 1),
      `Local backlog label for ${theme.title.toLowerCase()}`
    );
  });
}

function publishIssues({ repo, startNumber, count }) {
  ensureSprintLabels(repo);

  const backlog = sprintThemes.flatMap((theme) =>
    buildSprint(theme).map((issue) => ({
      ...issue,
      sprint: theme.label
    }))
  );
  const selected = backlog.slice(0, count);
  let issueNumber = startNumber;

  for (const issue of selected) {
    const labels = [issue.sprint, issue.label];
    const args = [
      "api",
      "--method",
      "POST",
      `repos/${repo}/issues`,
      "-f",
      `title=${issue.title}`,
      "-f",
      `body=${issue.body}`
    ];

    for (const label of labels) {
      args.push("-f", `labels[]=${label}`);
    }

    run("gh", args);
    issueNumber += 1;
  }

  return issueNumber - 1;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      [
        "Usage:",
        "  node scripts/sidewalk-backlog.mjs --write-backlog [--backlog-path path] [--start number]",
        "  node scripts/sidewalk-backlog.mjs --publish --count N [--start number] [--repo owner/repo]",
        "",
        "Behavior:",
        "  - repo is read from git remote get-url origin unless --repo is passed",
        "  - start defaults to the highest GitHub issue number + 1",
        "  - publish creates sprint labels if missing",
        "  - publish uses gh api issue payloads with labels[] entries"
      ].join("\n") + "\n"
    );
    return;
  }

  const repo = getRepo(args);
  const maxIssueNumber = getExistingMaxIssueNumber(repo);
  const startNumber = Math.max(Number.isFinite(args.start) ? args.start : 0, maxIssueNumber + 1);

  if (args.writeBacklog || !args.publish) {
    const content = buildBacklog({ startNumber });
    mkdirSync(path.dirname(args.backlogPath), { recursive: true });
    writeFileSync(args.backlogPath, content + "\n");
    process.stdout.write(`${args.backlogPath}\n`);
  }

  if (args.publish) {
    if (!Number.isFinite(args.count) || args.count <= 0) {
      throw new Error("--count must be a positive integer when using --publish");
    }
    const lastCreated = publishIssues({ repo, startNumber, count: args.count });
    process.stdout.write(`Published through #${lastCreated} in ${repo}\n`);
  }
}

main();
