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

test("an organization can acknowledge, record progress or claim a resolution, and nothing else", () => {
  assert.deepEqual(allowedTransitions("SUBMITTED", "ORGANIZATION"), ["ACKNOWLEDGED", "RESOLVED"]);
  assert.deepEqual(allowedTransitions("ACKNOWLEDGED", "ORGANIZATION"), ["IN_PROGRESS", "RESOLVED"]);
  assert.deepEqual(allowedTransitions("IN_PROGRESS", "ORGANIZATION"), ["RESOLVED"]);
  assert.deepEqual(allowedTransitions("REOPENED", "ORGANIZATION"), [
    "ACKNOWLEDGED",
    "IN_PROGRESS",
    "RESOLVED"
  ]);
});

test("an organization can never reject, close as a duplicate, or reopen a report, and cannot touch a closed one", () => {
  for (const from of REPORT_STATUSES) {
    for (const forbidden of ["REJECTED", "DUPLICATE", "REOPENED", "UNDER_REVIEW"] as const) {
      assert.equal(
        canTransition(from, forbidden, "ORGANIZATION"),
        false,
        `${from} -> ${forbidden}`
      );
    }
  }
  assert.deepEqual(allowedTransitions("RESOLVED", "ORGANIZATION"), []);
  assert.deepEqual(allowedTransitions("REJECTED", "ORGANIZATION"), []);
  assert.deepEqual(allowedTransitions("DUPLICATE", "ORGANIZATION"), []);
});

test("an organization's powers are always a subset of staff's, so it can never do something staff cannot", () => {
  for (const from of REPORT_STATUSES) {
    const staff = allowedTransitions(from, "STAFF");
    for (const to of allowedTransitions(from, "ORGANIZATION")) assert.ok(staff.includes(to));
  }
});
