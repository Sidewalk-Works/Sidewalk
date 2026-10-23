-- Shared rate-limit counters. Created UNLOGGED on purpose: they are rewritten on almost every request, nothing
-- depends on them surviving a crash (limits simply start again), and skipping the write-ahead log makes each hit
-- far cheaper. A low fillfactor leaves room for in-place (HOT) updates, so the table stays small without
-- constant vacuuming. Prisma does not model either setting; `prisma migrate diff` correctly reports no drift.
CREATE UNLOGGED TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
) WITH (fillfactor = 70);

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
