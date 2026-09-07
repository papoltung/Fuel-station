import assert from "node:assert/strict";
import test from "node:test";
import { canAssignRole } from "./role-policy";

test("staff and manager cannot assign roles", () => {
  assert.equal(canAssignRole({ actorId: 2, actorRole: "staff", targetId: 3, nextRole: "manager" }), false);
  assert.equal(canAssignRole({ actorId: 2, actorRole: "manager", targetId: 3, nextRole: "staff" }), false);
});

test("owner can assign another user's role", () => {
  assert.equal(canAssignRole({ actorId: 1, actorRole: "owner", targetId: 2, nextRole: "manager" }), true);
});

test("owner cannot demote their own account", () => {
  assert.equal(canAssignRole({ actorId: 1, actorRole: "owner", targetId: 1, nextRole: "staff" }), false);
});
