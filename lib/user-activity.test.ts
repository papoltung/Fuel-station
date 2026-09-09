import assert from "node:assert/strict";
import test from "node:test";
import { shouldRefreshLastSeen } from "./user-activity";

test("refreshes lastSeenAt at most once every ten minutes", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  assert.equal(shouldRefreshLastSeen(new Date("2026-09-09T11:49:59.000Z"), now), true);
  assert.equal(shouldRefreshLastSeen(new Date("2026-09-09T11:50:00.000Z"), now), true);
  assert.equal(shouldRefreshLastSeen(new Date("2026-09-09T11:55:00.000Z"), now), false);
  assert.equal(shouldRefreshLastSeen(new Date("2026-09-09T12:01:00.000Z"), now), false);
});
