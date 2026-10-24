/**
 * Drift guard: fails `pnpm convex:typecheck` (and `npx convex dev`) if a
 * Convex validator stops matching its packages/shared type.
 * Type-only imports, so nothing here is bundled or deployed as code.
 *
 * If one of these lines errors: packages/shared is the source of truth, so
 * update the validator in convex/schema.ts to match it.
 */
import type { Infer } from "convex/values";
import type {
  ApprovalRecord,
  Bill as SharedBill,
  Decision,
  Entity,
  EntityKind,
  Mode,
  PolicyKind,
  RuleHit,
  TaintHit,
  ToolCallEvent,
  UntrustedSpan,
} from "../packages/shared/src/types.js";
import type { Bill as BankBill } from "../apps/mock-servers/bank/src/types.js";
import type {
  approvalRecord,
  bill,
  decision,
  entity,
  entityKind,
  mode,
  policyKind,
  ruleHit,
  taintHit,
  toolCallEvent,
  untrustedSpan,
} from "./schema.js";

/** Exact type equality: same keys, same optionality, same unions. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/** For fields typed `unknown` in shared but stored as v.any(): mutual assignability. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

/** ToolCallEvent: exact on every field except `args` (Record<string, unknown> vs v.any()). */
type EventDoc = Infer<typeof toolCallEvent>;

export type SharedTypesMatch = [
  Assert<Equal<Infer<typeof mode>, Mode>>,
  Assert<Equal<Infer<typeof policyKind>, PolicyKind>>,
  Assert<Equal<Infer<typeof decision>, Decision>>,
  Assert<Equal<Infer<typeof entityKind>, EntityKind>>,
  Assert<Equal<Infer<typeof ruleHit>, RuleHit>>,
  Assert<Equal<Infer<typeof entity>, Entity>>,
  Assert<Equal<Infer<typeof taintHit>, TaintHit>>,
  Assert<Equal<Infer<typeof untrustedSpan>, UntrustedSpan>>,
  Assert<Equal<Infer<typeof approvalRecord>, ApprovalRecord>>,
  Assert<Equal<keyof EventDoc, keyof ToolCallEvent>>,
  Assert<Equal<Omit<EventDoc, "args">, Omit<ToolCallEvent, "args">>>,
  Assert<Same<EventDoc["args"], ToolCallEvent["args"]>>,
  // ...and pin the validator itself so loosening it to v.any() is caught too.
  Assert<Equal<EventDoc["args"], Record<string, any>>>,
  // Bill: the shared fields match exactly, and the stored shape is exactly the bank's extended Bill.
  Assert<Equal<Pick<Infer<typeof bill>, keyof SharedBill>, SharedBill>>,
  Assert<Equal<Infer<typeof bill>, BankBill>>,
];
