/**
 * `engine/src/shelters` — the shelter object.
 *
 * Capacity semantics, the triage reserve floor, the open/close window and the
 * tri-state pet policy all live in one class, because they interact: a blank
 * capacity disables the reserve, and the reserve only ever narrows the
 * non-priority view of a capacity that exists.
 */

export { Shelter } from "./shelter.js";

export {
  arriveAtDoor,
  isPriorityForAdmission,
  policyRefusedAt,
  type DoorOutcome,
} from "./admit.js";

export {
  ARCHIVED_TRIAGE_FRACTIONS,
  applyTriageReserve,
  blockedOnlyByReserve,
  releaseRule,
  triageCensus,
  triageLoadMessage,
  triageReserveFor,
  type TriageCensus,
} from "./triage.js";

export {
  applyPolicyColumns,
  parseAdultsOnly,
  parsePetIntake,
  petAdmittedAt,
  petPolicyAdmitDefaultFromInt,
  petPolicyCensus,
  type PetPolicyCensus,
} from "./policy.js";
