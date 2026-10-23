import type { ApplicationStatus } from "../db/schema";

const transitions = {
  discovered: ["proposed"],
  proposed: ["approval_required", "approved", "manual_required", "dismissed"],
  approval_required: ["approved", "dismissed", "expired"],
  approved: ["applying", "manual_required", "dismissed"],
  manual_required: ["submitted", "dismissed", "outcome_unknown"],
  applying: ["submitted", "failed", "outcome_unknown"],
  submitted: ["acknowledged", "interview", "rejected", "offer", "withdrawn"],
  acknowledged: ["interview", "rejected", "offer", "withdrawn"],
  interview: ["rejected", "offer", "withdrawn"],
  failed: ["applying", "manual_required", "dismissed"],
  outcome_unknown: ["acknowledged", "interview", "rejected", "offer", "withdrawn"],
  rejected: [],
  offer: ["withdrawn"],
  withdrawn: [],
  dismissed: [],
  expired: [],
} satisfies Record<ApplicationStatus, readonly ApplicationStatus[]>;

export function canTransitionApplication(from: ApplicationStatus, to: ApplicationStatus) {
  return (transitions[from] as readonly ApplicationStatus[]).includes(to);
}

export function assertApplicationTransition(from: ApplicationStatus, to: ApplicationStatus) {
  if (!canTransitionApplication(from, to)) {
    throw new Error(`Invalid application transition: ${from} -> ${to}`);
  }
}

export function nextApplicationStatuses(from: ApplicationStatus): readonly ApplicationStatus[] {
  return transitions[from];
}
