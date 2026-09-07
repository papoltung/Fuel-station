export type AssignableRole = "owner" | "manager" | "staff";

export function canAssignRole(input: {
  actorId: number;
  actorRole: string;
  targetId: number;
  nextRole: AssignableRole;
}) {
  if (input.actorRole !== "owner") return false;
  if (input.actorId === input.targetId && input.nextRole !== "owner") return false;
  return true;
}
