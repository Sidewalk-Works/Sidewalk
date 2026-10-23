-- Integrity guards that hold even if application code (or someone with SQL access) gets it wrong.

-- 1. Coordinates must be real coordinates.
ALTER TABLE "Report" ADD CONSTRAINT "Report_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "Report" ADD CONSTRAINT "Report_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180);

-- 2. A resolution can only be verified while the report is resolved, and a resolved report records when.
ALTER TABLE "Report" ADD CONSTRAINT "Report_verification_requires_resolved"
  CHECK ("verification" = 'NONE' OR "status" = 'RESOLVED');
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolved_has_timestamp"
  CHECK ("status" <> 'RESOLVED' OR "resolvedAt" IS NOT NULL);

-- 3. The accountability trail is append-only: rows can be added, never changed or removed.
--    (TRUNCATE is not covered, so disposable test databases can still be emptied.)
CREATE OR REPLACE FUNCTION sidewalk_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION sidewalk_forbid_mutation();

CREATE TRIGGER "ModerationAction_append_only"
  BEFORE UPDATE OR DELETE ON "ModerationAction"
  FOR EACH ROW EXECUTE FUNCTION sidewalk_forbid_mutation();

CREATE TRIGGER "ReportStatusHistory_append_only"
  BEFORE UPDATE OR DELETE ON "ReportStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION sidewalk_forbid_mutation();
