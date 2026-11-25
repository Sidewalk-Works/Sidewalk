// Empties every table of a throwaway database so end-to-end runs start from a known state.
// Refuses to touch any database whose name does not end in _test or _e2e.
import path from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({
  path: process.env.DOTENV_CONFIG_PATH ?? path.resolve(__dirname, "../../../.env"),
  quiet: true
});

const url = process.env.DATABASE_URL ?? "";
const dbName = new URL(url || "postgresql://x/none").pathname.slice(1);
if (!/_(test|e2e)$/.test(dbName)) {
  console.error(
    `Refusing to truncate "${dbName}": only databases ending in _test or _e2e are allowed.`
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const tables = [
  "RateLimitBucket",
  "OfficialResponse",
  "ReportOrganization",
  "OrganizationDocument",
  "OrganizationInvitation",
  "OrganizationMember",
  "VerificationDecision",
  "OrganizationApplication",
  "Organization",
  "EmailOutbox",
  "Notification",
  "ReportFollow",
  "AuthToken",
  "AuditLog",
  "ModerationAction",
  "ContentFlag",
  "InternalNote",
  "ActivityEvent",
  "Comment",
  "ReportStatusHistory",
  "ReportEvidence",
  "Report",
  "Session",
  "User",
  "Category"
];

prisma
  .$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
  )
  .then(() => console.log(`Truncated ${dbName}.`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
