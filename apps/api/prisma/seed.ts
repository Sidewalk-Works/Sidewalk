// Development seed. Everything here is unmistakably synthetic: accounts use reserved .test domains,
// every report ends with a synthetic-data notice, and no photographs are invented as "evidence".
import path from "node:path";
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeOrganizationName } from "@sidewalk/contracts";
import { PrismaClient, type ReportStatus } from "../src/generated/prisma/client";

config({
  path: process.env.DOTENV_CONFIG_PATH ?? path.resolve(__dirname, "../../../.env"),
  quiet: true
});

if (process.env.NODE_ENV === "production") {
  console.error(
    "Refusing to seed: NODE_ENV=production. The seed creates development accounts and must never run in production."
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run `pnpm env:init` first.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});
const NOTICE = "\n\n[Synthetic seed data for development. Not a real report.]";

const CATEGORIES = [
  {
    slug: "roads-and-potholes",
    name: "Roads and potholes",
    description: "Potholes, collapsed road shoulders, damaged bridges and culverts.",
    sortOrder: 10
  },
  {
    slug: "flooding-and-drainage",
    name: "Flooding and drainage",
    description: "Blocked drains, standing water and flooded streets.",
    sortOrder: 20
  },
  {
    slug: "waste-and-sanitation",
    name: "Waste and sanitation",
    description: "Uncollected refuse, illegal dumping and public toilets.",
    sortOrder: 30
  },
  {
    slug: "streetlights-and-power",
    name: "Streetlights and power",
    description: "Broken streetlights, fallen poles and exposed wiring.",
    sortOrder: 40
  },
  {
    slug: "water-supply",
    name: "Water supply",
    description: "Burst pipes, dry taps and contaminated water points.",
    sortOrder: 50
  },
  {
    slug: "public-facilities",
    name: "Public facilities",
    description: "Schools, clinics, markets, parks and other shared buildings.",
    sortOrder: 60
  },
  {
    slug: "erosion-and-landslides",
    name: "Erosion and landslides",
    description: "Gullies, collapsing slopes and washed-away roads.",
    sortOrder: 70
  },
  {
    slug: "public-safety-hazards",
    name: "Public safety hazards",
    description: "Open manholes, exposed hazards and unsafe structures.",
    sortOrder: 80
  }
];

interface SeedReport {
  key: string;
  title: string;
  description: string;
  category: string;
  lat: number;
  lng: number;
  address: string;
  area: string;
  status: ReportStatus;
  daysAgo: number;
  showName?: boolean;
  resident: 1 | 2 | 3;
  note?: string;
}

const REPORTS: SeedReport[] = [
  {
    key: "r01",
    title: "Large pothole on Ogunlana Drive near the bus stop",
    description:
      "The pothole has grown across most of the lane. Danfo drivers swerve into oncoming traffic to avoid it, and motorcycles have fallen in at night.",
    category: "roads-and-potholes",
    lat: 6.4998,
    lng: 3.3562,
    address: "Ogunlana Drive, opposite the bus stop",
    area: "Surulere, Lagos",
    status: "ACKNOWLEDGED",
    daysAgo: 21,
    showName: true,
    resident: 1
  },
  {
    key: "r02",
    title: "Blocked drainage floods the service road after every rain",
    description:
      "The covered drain beside the service road is full of silt and plastic. Water reaches shop doorsteps within twenty minutes of rain.",
    category: "flooding-and-drainage",
    lat: 6.6061,
    lng: 3.3496,
    address: "Service road beside the pedestrian bridge",
    area: "Ikeja, Lagos",
    status: "UNDER_REVIEW",
    daysAgo: 9,
    resident: 2
  },
  {
    key: "r03",
    title: "Refuse heap growing beside the market gate",
    description:
      "Refuse has not been collected for about three weeks. The pile now blocks half of the footpath and attracts flies.",
    category: "waste-and-sanitation",
    lat: 9.0792,
    lng: 7.4745,
    address: "Market gate, east side",
    area: "Wuse 2, Abuja",
    status: "IN_PROGRESS",
    daysAgo: 18,
    resident: 3,
    note: "A collection schedule was confirmed with the area council. Clearing is under way."
  },
  {
    key: "r04",
    title: "Streetlights out along the whole avenue",
    description:
      "Eleven consecutive streetlights have been dark since the last storm. Residents walk home in the dark and two phones were snatched.",
    category: "streetlights-and-power",
    lat: 9.1118,
    lng: 7.4017,
    address: "3rd Avenue, from the roundabout to the filling station",
    area: "Gwarinpa, Abuja",
    status: "SUBMITTED",
    daysAgo: 2,
    resident: 1
  },
  {
    key: "r05",
    title: "No running water in the district for two weeks",
    description:
      "Taps have been dry for fourteen days. Households are buying water from tanker vendors at several times the usual price.",
    category: "water-supply",
    lat: 12.0034,
    lng: 8.5168,
    address: "Streets behind the central mosque",
    area: "Sabon Gari, Kano",
    status: "UNDER_REVIEW",
    daysAgo: 6,
    resident: 2
  },
  {
    key: "r06",
    title: "Collapsed culvert cuts off the footpath to the school",
    description:
      "The culvert slab cracked and fell in. Children now cross a plank laid over the gap.",
    category: "roads-and-potholes",
    lat: 7.4391,
    lng: 3.9143,
    address: "Footpath to the primary school",
    area: "Bodija, Ibadan",
    status: "RESOLVED",
    daysAgo: 40,
    resident: 3,
    note: "The slab was replaced and the path reopened. Recorded from a community update; no photographs were attached."
  },
  {
    key: "r07",
    title: "Open manhole on the main road, cover stolen",
    description:
      "The manhole cover has been missing for a week. A branch is stuck in it as a warning, which is not enough at night.",
    category: "public-safety-hazards",
    lat: 4.8049,
    lng: 7.0124,
    address: "Main road, near the traffic light",
    area: "Port Harcourt",
    status: "ACKNOWLEDGED",
    daysAgo: 12,
    resident: 1
  },
  {
    key: "r08",
    title: "Erosion gully is eating into the road edge",
    description:
      "A gully has opened beside the road and widens with each rain. The nearest house is about three metres from the edge.",
    category: "erosion-and-landslides",
    lat: 6.4631,
    lng: 7.5398,
    address: "Road edge behind the third crescent",
    area: "Independence Layout, Enugu",
    status: "ACKNOWLEDGED",
    daysAgo: 33,
    resident: 2
  },
  {
    key: "r09",
    title: "Broken gate and benches at the public primary school",
    description:
      "The perimeter gate no longer closes and half the classroom benches are broken. Pupils sit on the floor.",
    category: "public-facilities",
    lat: 6.5912,
    lng: 3.3772,
    address: "Public primary school, main entrance",
    area: "Ikeja, Lagos",
    status: "REOPENED",
    daysAgo: 55,
    resident: 3
  },
  {
    key: "r10",
    title: "Road shoulder collapsed after heavy rain",
    description:
      "About four metres of the road shoulder has slumped. Vehicles are drifting onto the carriageway to avoid it.",
    category: "roads-and-potholes",
    lat: 6.4712,
    lng: 3.5806,
    address: "Coastal road, before the second roundabout",
    area: "Lekki, Lagos",
    status: "SUBMITTED",
    daysAgo: 1,
    resident: 2
  },
  {
    key: "r11",
    title: "Illegal dumpsite smouldering near the estate wall",
    description: "Waste is burned nightly. Smoke drifts into the estate and children are coughing.",
    category: "waste-and-sanitation",
    lat: 7.3844,
    lng: 3.9462,
    address: "Open plot behind the estate wall",
    area: "Ibadan",
    status: "SUBMITTED",
    daysAgo: 4,
    resident: 1
  },
  {
    key: "r12",
    title: "Complaint about a neighbour's generator noise",
    description:
      "A private neighbour runs a generator at night. This is a private dispute rather than public infrastructure.",
    category: "public-facilities",
    lat: 6.5201,
    lng: 3.3801,
    address: "Residential street",
    area: "Yaba, Lagos",
    status: "REJECTED",
    daysAgo: 27,
    resident: 3,
    note: "Closed as out of scope: this is a private dispute, not a public infrastructure issue."
  },
  {
    key: "r13",
    title: "Same pothole as the one on Ogunlana Drive",
    description: "Large pothole at the same junction as an existing report.",
    category: "roads-and-potholes",
    lat: 6.4999,
    lng: 3.3564,
    address: "Ogunlana Drive junction",
    area: "Surulere, Lagos",
    status: "DUPLICATE",
    daysAgo: 15,
    resident: 2,
    note: "Closed as a duplicate of the Ogunlana Drive pothole report already being tracked."
  },
  {
    key: "r14",
    title: "Burst water main flooding the street",
    description:
      "A pipe burst two days ago and water runs down the street. The road surface is breaking up around it.",
    category: "water-supply",
    lat: 9.0421,
    lng: 7.4934,
    address: "Corner of the market road",
    area: "Garki, Abuja",
    status: "SUBMITTED",
    daysAgo: 0,
    resident: 3
  }
];

/**
 * Two invented institutions, named as such. They exist so the interface has something to show; they are not real
 * agencies and nothing here implies a real body has been verified. The "verified" one is verified the way a real one
 * would be (an application, a staff decision on record), by the synthetic administrator, and says so in the reason.
 */
async function seedOrganizations(uid: (k: string) => string): Promise<void> {
  const exists = await prisma.organization.findUnique({ where: { slug: "sample-roads-agency" } });
  if (exists) return;
  const admin = uid("admin");
  const now = new Date();

  const roads = await prisma.organization.create({
    data: {
      slug: "sample-roads-agency",
      name: "Sample State Roads Agency (synthetic)",
      normalizedName: normalizeOrganizationName("Sample State Roads Agency (synthetic)"),
      aliases: ["Sample Roads"],
      type: "AGENCY",
      level: "STATE",
      jurisdiction: "Sample State (synthetic)",
      serviceAreas: ["Sample City"],
      description:
        "An invented agency used in the development seed. It is not a real institution. [Synthetic seed data.]",
      website: "https://roads.sample.test",
      publicEmail: "info@roads.sample.test",
      verificationStatus: "VERIFIED",
      verifiedAt: now,
      publicProfile: true,
      createdById: uid("orgadmin")
    }
  });
  const application = await prisma.organizationApplication.create({
    data: {
      organizationId: roads.id,
      applicantId: uid("orgadmin"),
      status: "APPROVED",
      roleTitle: "Seed administrator",
      authorityStatement: "Synthetic seed account.",
      reviewerId: admin,
      submittedAt: now,
      decidedAt: now,
      decisionReason: "Synthetic seed organization. Not a real verification."
    }
  });
  await prisma.verificationDecision.create({
    data: {
      organizationId: roads.id,
      applicationId: application.id,
      action: "APPROVED",
      actorId: admin,
      reason: "Synthetic seed organization. Not a real verification.",
      previous: { verificationStatus: "UNVERIFIED", status: "ACTIVE" },
      next: { verificationStatus: "VERIFIED", status: "ACTIVE" }
    }
  });
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: roads.id, userId: uid("orgadmin"), role: "ADMIN" },
      { organizationId: roads.id, userId: uid("orgrep"), role: "REPRESENTATIVE" }
    ]
  });

  // A second, unlisted and unverified, with an application waiting for a decision, so the staff queue is not empty.
  const drainage = await prisma.organization.create({
    data: {
      slug: "sample-ward-drainage-office",
      name: "Sample Ward Drainage Office (synthetic)",
      normalizedName: normalizeOrganizationName("Sample Ward Drainage Office (synthetic)"),
      type: "DEPARTMENT",
      level: "LOCAL",
      jurisdiction: "Sample Ward (synthetic)",
      description: "An invented office. It has applied for verification and has not been verified.",
      publicProfile: false,
      createdById: uid("1")
    }
  });
  await prisma.organizationApplication.create({
    data: {
      organizationId: drainage.id,
      applicantId: uid("1"),
      status: "SUBMITTED",
      roleTitle: "Ward officer (claimed)",
      authorityStatement: "Synthetic application waiting for review.",
      officialReferences: [
        { kind: "Website", label: "Ward page", value: "https://ward.sample.test" }
      ],
      submittedAt: now
    }
  });

  // One acknowledgement on a seeded report that is already acknowledged, so a response shows on a real page.
  const target = await prisma.report.findFirst({
    where: { status: "ACKNOWLEDGED", reference: { startsWith: "SW-SD" } },
    orderBy: { reference: "asc" }
  });
  if (target) {
    await prisma.reportOrganization.create({
      data: {
        reportId: target.id,
        organizationId: roads.id,
        basis: "ORGANIZATION_ADDED",
        status: "ACTIVE",
        addedById: uid("orgrep"),
        acknowledgedAt: now
      }
    });
    await prisma.officialResponse.create({
      data: {
        reportId: target.id,
        organizationId: roads.id,
        authorId: uid("orgrep"),
        type: "ACKNOWLEDGEMENT",
        body: "We have received this report and a crew will inspect the site. [Synthetic seed data.]",
        organizationName: roads.name,
        organizationSlug: roads.slug,
        authorName: "Seed Organization Representative",
        verifiedAtPublication: now
      }
    });
    await prisma.activityEvent.create({
      data: {
        reportId: target.id,
        type: "OFFICIAL_RESPONSE",
        actorId: uid("orgrep"),
        isPublic: true,
        payload: {
          actorRole: "ORGANIZATION",
          organization: { slug: roads.slug, name: roads.name },
          responseType: "ACKNOWLEDGEMENT",
          note: "We have received this report and a crew will inspect the site."
        }
      }
    });
  }
}

async function main(): Promise<void> {
  const generated = !process.env.SEED_PASSWORD;
  const password = process.env.SEED_PASSWORD || randomBytes(12).toString("base64url");
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1
  });

  for (const c of CATEGORIES) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));

  const people = [
    {
      key: "admin",
      email: "admin@sidewalk.test",
      displayName: "Local Dev Admin",
      role: "ADMIN" as const
    },
    {
      key: "mod",
      email: "moderator@sidewalk.test",
      displayName: "Local Dev Moderator",
      role: "MODERATOR" as const
    },
    {
      key: "1",
      email: "resident1@seed.sidewalk.test",
      displayName: "Seed Resident One",
      role: "CITIZEN" as const
    },
    {
      key: "2",
      email: "resident2@seed.sidewalk.test",
      displayName: "Seed Resident Two",
      role: "CITIZEN" as const
    },
    {
      key: "3",
      email: "resident3@seed.sidewalk.test",
      displayName: "Seed Resident Three",
      role: "CITIZEN" as const
    },
    {
      key: "orgadmin",
      email: "org-admin@seed.sidewalk.test",
      displayName: "Seed Organization Administrator",
      role: "CITIZEN" as const
    },
    {
      key: "orgrep",
      email: "org-rep@seed.sidewalk.test",
      displayName: "Seed Organization Representative",
      role: "CITIZEN" as const
    }
  ];
  const users = new Map<string, { id: string; created: boolean }>();
  for (const p of people) {
    const existing = await prisma.user.findUnique({ where: { email: p.email } });
    if (existing) {
      // Seeded accounts are synthetic, so they count as verified (a real address would be confirmed by email).
      if (!existing.emailVerifiedAt) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { emailVerifiedAt: new Date() }
        });
      }
      users.set(p.key, { id: existing.id, created: false });
      continue;
    }
    const created = await prisma.user.create({
      data: {
        email: p.email,
        displayName: p.displayName,
        role: p.role,
        passwordHash: hash,
        emailVerifiedAt: new Date()
      }
    });
    users.set(p.key, { id: created.id, created: true });
  }
  const uid = (k: string) => (users.get(k) as { id: string }).id;

  let made = 0;
  for (const r of REPORTS) {
    const requestId = `00000000-0000-4000-8000-0000000000${r.key.slice(1)}`;
    const exists = await prisma.report.findFirst({ where: { clientRequestId: requestId } });
    if (exists) continue;
    const created = new Date(Date.now() - r.daysAgo * 86_400_000);
    const staffId = uid("mod");
    const ownerId = uid(String(r.resident));
    const report = await prisma.report.create({
      data: {
        reference: `SW-SD${r.key.slice(1).padStart(4, "0")}`,
        title: r.title,
        description: r.description + NOTICE,
        categoryId: categories.get(r.category) as string,
        status: r.status,
        latitude: r.lat,
        longitude: r.lng,
        addressText: r.address,
        areaName: r.area,
        reporterId: ownerId,
        showReporterName: r.showName ?? false,
        clientRequestId: requestId,
        createdAt: created,
        lastActivityAt: new Date(created.getTime() + Math.min(r.daysAgo, 3) * 3_600_000),
        verification: r.status === "RESOLVED" ? "CLAIMED" : "NONE",
        resolutionNote: r.status === "RESOLVED" ? r.note : null,
        resolvedAt: r.status === "RESOLVED" ? new Date(created.getTime() + 5 * 86_400_000) : null
      }
    });
    await prisma.reportStatusHistory.create({
      data: {
        reportId: report.id,
        toStatus: "SUBMITTED",
        actorId: ownerId,
        actorRole: "CITIZEN",
        basis: "REPORTER_CLAIM",
        createdAt: created
      }
    });
    await prisma.activityEvent.create({
      data: {
        reportId: report.id,
        type: "SUBMITTED",
        actorId: ownerId,
        payload: { actorRole: "REPORTER", to: "SUBMITTED" },
        createdAt: created
      }
    });

    // Walk each report through a legal path to its seeded status so history is always consistent.
    const path: Record<string, ReportStatus[]> = {
      SUBMITTED: [],
      UNDER_REVIEW: ["UNDER_REVIEW"],
      ACKNOWLEDGED: ["UNDER_REVIEW", "ACKNOWLEDGED"],
      IN_PROGRESS: ["UNDER_REVIEW", "ACKNOWLEDGED", "IN_PROGRESS"],
      RESOLVED: ["UNDER_REVIEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"],
      REOPENED: ["UNDER_REVIEW", "ACKNOWLEDGED", "RESOLVED", "REOPENED"],
      REJECTED: ["UNDER_REVIEW", "REJECTED"],
      DUPLICATE: ["DUPLICATE"]
    };
    let from: ReportStatus = "SUBMITTED";
    let step = 1;
    for (const to of path[r.status] ?? []) {
      const at = new Date(created.getTime() + step++ * 86_400_000 * Math.max(0.2, r.daysAgo / 8));
      const needsNote = ["RESOLVED", "REOPENED", "REJECTED", "DUPLICATE"].includes(to);
      const byOwner = to === "REOPENED";
      const note = needsNote
        ? to === "REOPENED"
          ? "The surface is breaking up again after two weeks; the repair did not hold."
          : (r.note ?? "Recorded.")
        : to === "IN_PROGRESS"
          ? (r.note ?? null)
          : null;
      await prisma.reportStatusHistory.create({
        data: {
          reportId: report.id,
          fromStatus: from,
          toStatus: to,
          actorId: byOwner ? ownerId : staffId,
          actorRole: byOwner ? "CITIZEN" : "MODERATOR",
          basis: byOwner ? "REPORTER_CLAIM" : "STAFF_REVIEW",
          publicNote: note,
          createdAt: at
        }
      });
      await prisma.activityEvent.create({
        data: {
          reportId: report.id,
          type: "STATUS_CHANGED",
          actorId: byOwner ? ownerId : staffId,
          payload: {
            actorRole: byOwner ? "REPORTER" : "STAFF",
            from,
            to,
            basis: byOwner ? "REPORTER_CLAIM" : "STAFF_REVIEW",
            note
          },
          createdAt: at
        }
      });
      from = to;
    }
    made++;
  }

  // A little discussion, including one comment and one report that are flagged so the moderation queue is not empty.
  const first = await prisma.report.findFirst({
    where: { clientRequestId: "00000000-0000-4000-8000-000000000001" }
  });
  if (first && (await prisma.comment.count({ where: { reportId: first.id } })) === 0) {
    const c1 = await prisma.comment.create({
      data: {
        reportId: first.id,
        authorId: uid("2"),
        body: "I pass here every morning. It is deeper than last month and a tyre burst here on Tuesday."
      }
    });
    await prisma.comment.create({
      data: {
        reportId: first.id,
        authorId: uid("mod"),
        kind: "STAFF",
        body: "We have asked the area council for a repair date and will post it here when we have one."
      }
    });
    const spam = await prisma.comment.create({
      data: {
        reportId: first.id,
        authorId: uid("3"),
        body: "Buy cheap data bundles now, visit the link in my profile for 50% off!"
      }
    });
    await prisma.contentFlag.create({
      data: {
        target: "COMMENT",
        reportId: first.id,
        commentId: spam.id,
        targetKey: `comment:${spam.id}`,
        reporterId: uid("1"),
        reason: "SPAM",
        details: "Advertising, unrelated to the pothole."
      }
    });
    void c1;
  }
  const dump = await prisma.report.findFirst({
    where: { clientRequestId: "00000000-0000-4000-8000-000000000011" }
  });
  if (dump && (await prisma.contentFlag.count({ where: { reportId: dump.id } })) === 0) {
    await prisma.contentFlag.create({
      data: {
        target: "REPORT",
        reportId: dump.id,
        targetKey: `report:${dump.id}`,
        reporterId: uid("2"),
        reason: "MISLEADING",
        details: "I live nearby and have not seen burning here."
      }
    });
  }

  await seedOrganizations(uid);

  console.log(`\nSeed complete: ${made} new synthetic reports, ${CATEGORIES.length} categories.\n`);
  const created = [...users.entries()].filter(([, v]) => v.created).length;
  if (created > 0) {
    console.log("Development accounts (synthetic, local only):");
    for (const p of people) console.log(`  ${p.role.padEnd(9)} ${p.email}`);
    console.log(
      generated
        ? `\nGenerated password for new accounts (shown once): ${password}`
        : "\nNew accounts use SEED_PASSWORD from your environment."
    );
  } else {
    console.log("Accounts already existed; their passwords were not changed.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
