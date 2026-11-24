/**
 * Standalone shared contract helper for issue #1412.
 *
 * Adds a typed CaseStatus enum and Case contract shape so clients can render
 * case status reliably. Kept standalone (no index export wiring) per PR rules.
 */

export const CaseStatus = {
  OPEN: "open",
  OPENED: "opened", // legacy alias observed in data; clients should normalize
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
} as const;

export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

export interface Case {
  id: string;
  report_id: string;
  title: string;
  description: string;
  status: CaseStatus;
  assigned_to_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseDetail extends Case {
  follower_count: number;
  is_following: boolean;
}

export function isCaseStatus(value: string): value is CaseStatus {
  return (Object.values(CaseStatus) as string[]).includes(value);
}
