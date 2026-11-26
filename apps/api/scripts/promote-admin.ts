// Grants the ADMIN role to an EXISTING account. This is how the first administrator is created in a real
// deployment: register normally, then run this with direct access to the database. There is no default
// administrator and no hardcoded credential anywhere in the production path.
//
//   pnpm --filter @sidewalk/api admin:promote -- --email you@example.org
//
// Administrators must have a confirmed email address to use the admin tools. Normally the account owner
// confirms it from the emailed link. If mail is not configured yet (the usual case while setting up the very
// first administrator), add --confirm-email to mark the address confirmed. It is an operator decision made
// with database access and is written to the audit log.
import path from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({
  path: process.env.DOTENV_CONFIG_PATH ?? path.resolve(__dirname, "../../../.env"),
  quiet: true
});

const confirmEmail = process.argv.includes("--confirm-email");
const flag = process.argv.indexOf("--email");
const email = flag >= 0 ? process.argv[flag + 1]?.trim().toLowerCase() : undefined;
if (!email) {
  console.error(
    "Usage: pnpm --filter @sidewalk/api admin:promote -- --email <address of an existing account> [--confirm-email]"
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});

async function main(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") {
    console.error(`No active account with that email. Register it through the web app first.`);
    process.exit(1);
  }
  const needsConfirm = confirmEmail && !user.emailVerifiedAt;
  if (user.role === "ADMIN" && !needsConfirm) {
    console.log("That account is already an administrator.");
    return;
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN", ...(needsConfirm ? { emailVerifiedAt: new Date() } : {}) }
    }),
    ...(user.role !== "ADMIN"
      ? [
          prisma.auditLog.create({
            data: {
              actorId: null,
              action: "user.role_changed",
              entityType: "User",
              entityId: user.id,
              metadata: { from: user.role, to: "ADMIN", via: "cli" }
            }
          })
        ]
      : []),
    ...(needsConfirm
      ? [
          prisma.auditLog.create({
            data: {
              actorId: null,
              action: "user.email_confirmed",
              entityType: "User",
              entityId: user.id,
              metadata: { via: "cli" }
            }
          })
        ]
      : [])
  ]);
  console.log(
    `${email} is now an administrator${needsConfirm ? " with a confirmed email address" : ""}. The change was written to the audit log.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
