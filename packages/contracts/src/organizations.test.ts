import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADMINISTRATIVE_LEVELS,
  APPLICATION_STATUSES,
  APPLICATION_STATUS_INFO,
  MEMBER_ROLES,
  MEMBER_ROLE_INFO,
  ORGANIZATION_TYPES,
  ORGANIZATION_TYPE_INFO,
  ORG_VERIFICATION_INFO,
  ORG_VERIFICATION_STATUSES,
  RELATION_STATUSES,
  RELATION_STATUS_INFO,
  RESPONSE_TYPES,
  RESPONSE_TYPE_INFO,
  SUPERSEDING_RESPONSE_TYPES,
  normalizeOrganizationName,
  RESERVED_ORGANIZATION_SLUGS,
  slugifyOrganizationName
} from "./organizations";

test("every organization vocabulary entry is described in words", () => {
  for (const t of ORGANIZATION_TYPES)
    assert.ok(ORGANIZATION_TYPE_INFO[t].referenceHints.length >= 2);
  for (const v of ORG_VERIFICATION_STATUSES)
    assert.ok(ORG_VERIFICATION_INFO[v].meaning.length > 20);
  for (const a of APPLICATION_STATUSES) assert.ok(APPLICATION_STATUS_INFO[a].label.length > 0);
  for (const r of RESPONSE_TYPES) assert.ok(RESPONSE_TYPE_INFO[r].verb.length > 0);
  for (const r of RELATION_STATUSES) assert.ok(RELATION_STATUS_INFO[r].meaning.length > 0);
  assert.equal(ADMINISTRATIVE_LEVELS.length, 4);
});

test("an unverified profile is described as not official, and a claim as not verified", () => {
  assert.match(ORG_VERIFICATION_INFO.UNVERIFIED.meaning, /Do not treat its statements as official/);
  assert.match(
    RESPONSE_TYPE_INFO.RESOLUTION_CLAIM.meaning,
    /not an independently verified outcome/
  );
  assert.match(RESPONSE_TYPE_INFO.OUT_OF_REMIT.meaning, /not a finding/);
  assert.match(RESPONSE_TYPE_INFO.ACKNOWLEDGEMENT.meaning, /not an acceptance of responsibility/);
  assert.match(
    ORG_VERIFICATION_INFO.VERIFIED.meaning,
    /separate from independent verification|still separate/
  );
});

test("only administrators manage members, and only administrators and representatives respond", () => {
  assert.deepEqual(
    MEMBER_ROLES.filter((r) => MEMBER_ROLE_INFO[r].canManage),
    ["ADMIN"]
  );
  assert.deepEqual(
    MEMBER_ROLES.filter((r) => MEMBER_ROLE_INFO[r].canRespond),
    ["ADMIN", "REPRESENTATIVE"]
  );
});

test("corrections and withdrawals are the responses that replace an earlier one", () => {
  assert.deepEqual([...SUPERSEDING_RESPONSE_TYPES], ["CORRECTION", "WITHDRAWAL"]);
});

test("name normalisation ignores case, accents, punctuation and ampersands, but not real differences", () => {
  assert.equal(
    normalizeOrganizationName("  Lagos State Ministry of Works & Infrastructure  "),
    "lagos state ministry of works and infrastructure"
  );
  assert.equal(
    normalizeOrganizationName("LAGOS-STATE ministry, of works AND infrastructure"),
    "lagos state ministry of works and infrastructure"
  );
  assert.equal(normalizeOrganizationName("Ministère des Travaux"), "ministere des travaux");
  assert.notEqual(
    normalizeOrganizationName("Lagos State Ministry of Works"),
    normalizeOrganizationName("Ogun State Ministry of Works")
  );
});

test("slugs are lowercase words and hyphens, bounded in length, and never end in a hyphen", () => {
  for (const name of [
    "Lagos State Ministry of Works & Infrastructure",
    "  !!Roads!!  ",
    "A".repeat(200)
  ]) {
    const slug = slugifyOrganizationName(name);
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(slug.length <= 60);
  }
});

test("a name cannot take an address that is a built-in page", () => {
  for (const name of ["Mine", "APPLY", "Applications!", "  Invitations ", "Team"]) {
    const slug = slugifyOrganizationName(name);
    assert.ok(!RESERVED_ORGANIZATION_SLUGS.includes(slug), `${name} -> ${slug}`);
    assert.match(slug, /-organization$/);
  }
  assert.equal(slugifyOrganizationName("Mine Safety Board"), "mine-safety-board");
});
