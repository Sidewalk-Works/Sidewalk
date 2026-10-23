import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REPORT_STATUSES,
  STATUS_INFO,
  STATUS_TRANSITIONS,
  allowedTransitions,
  canTransition,
  transitionRequiresNote
} from "./lifecycle";

test("every status has display info and a transition entry", () => {
  for (const s of REPORT_STATUSES) {
    assert.ok(STATUS_INFO[s].label.length > 0);
    assert.ok(Array.isArray(STATUS_TRANSITIONS[s]));
  }
});

test("a report cannot move to itself", () => {
  for (const s of REPORT_STATUSES) assert.equal(STATUS_TRANSITIONS[s].includes(s), false);
});

test("owners may only claim resolution or reopen", () => {
  assert.deepEqual(allowedTransitions("IN_PROGRESS", "OWNER"), ["RESOLVED"]);
  assert.deepEqual(allowedTransitions("RESOLVED", "OWNER"), ["REOPENED"]);
  assert.equal(canTransition("SUBMITTED", "ACKNOWLEDGED", "OWNER"), false);
  assert.equal(canTransition("SUBMITTED", "ACKNOWLEDGED", "STAFF"), true);
});

test("a resolved report can only be reopened", () => {
  assert.deepEqual(allowedTransitions("RESOLVED", "STAFF"), ["REOPENED"]);
});

test("outcome transitions require an explanation", () => {
  for (const s of ["RESOLVED", "REOPENED", "REJECTED", "DUPLICATE"] as const) {
    assert.equal(transitionRequiresNote(s), true);
  }
  assert.equal(transitionRequiresNote("ACKNOWLEDGED"), false);
});
