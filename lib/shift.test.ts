import assert from "node:assert/strict";
import test from "node:test";
import { calculateShiftClose, canCloseShift, parseOpeningCash } from "./shift";

test("calculates expected cash and difference without rounding away satang", () => {
  assert.deepEqual(calculateShiftClose({ openingCash: 100, cashSales: 265.005, actualCash: 365 }), {
    cashSales: 265.005,
    expectedCash: 365.005,
    difference: -0.005,
  });
});

test("owner can close another user's open shift", () => {
  assert.equal(canCloseShift({ actorRole: "owner", actorId: 1, openedById: 2, status: "open" }), true);
});

test("staff and manager can close only their own open shift", () => {
  assert.equal(canCloseShift({ actorRole: "staff", actorId: 2, openedById: 2, status: "open" }), true);
  assert.equal(canCloseShift({ actorRole: "manager", actorId: 2, openedById: 3, status: "open" }), false);
  assert.equal(canCloseShift({ actorRole: "staff", actorId: 2, openedById: 3, status: "open" }), false);
});

test("closed shifts cannot be closed again", () => {
  assert.equal(canCloseShift({ actorRole: "owner", actorId: 1, openedById: 2, status: "closed" }), false);
});

test("opening cash must be a finite non-negative number", () => {
  assert.equal(parseOpeningCash({ openingCash: 250 }).value, 250);
  assert.equal(parseOpeningCash({ openingCash: -1 }).error, "INVALID_OPENING_CASH");
  assert.equal(parseOpeningCash({ openingCash: "250" }).error, "INVALID_OPENING_CASH");
});
