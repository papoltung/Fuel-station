import assert from "node:assert/strict";
import test from "node:test";
import { canCloseMeter, validatePumpFuel } from "./meter-context";

test("only the shift owner or owner can close an open meter", () => {
  assert.equal(canCloseMeter({ actorId: 7, actorRole: "staff", shiftOwnerId: 7, shiftStatus: "open", meterEnd: null }), true);
  assert.equal(canCloseMeter({ actorId: 9, actorRole: "manager", shiftOwnerId: 7, shiftStatus: "open", meterEnd: null }), false);
  assert.equal(canCloseMeter({ actorId: 9, actorRole: "owner", shiftOwnerId: 7, shiftStatus: "open", meterEnd: null }), true);
});

test("closed shifts and already closed meters cannot be closed again", () => {
  assert.equal(canCloseMeter({ actorId: 7, actorRole: "staff", shiftOwnerId: 7, shiftStatus: "closed", meterEnd: null }), false);
  assert.equal(canCloseMeter({ actorId: 7, actorRole: "staff", shiftOwnerId: 7, shiftStatus: "open", meterEnd: 10.5 }), false);
});

test("allows the user who opened a shiftless meter to close it", () => {
  assert.equal(canCloseMeter({ actorId: 7, actorRole: "staff", openedById: 7, meterEnd: null }), true);
  assert.equal(canCloseMeter({ actorId: 9, actorRole: "staff", openedById: 7, meterEnd: null }), false);
});

test("rejects a pump configured for a different fuel", () => {
  assert.deepEqual(validatePumpFuel({ configuredFuelTypeId: 1, requestedFuelTypeId: 2 }), { ok: false, code: "METER_FUEL_MISMATCH" });
  assert.deepEqual(validatePumpFuel({ configuredFuelTypeId: null, requestedFuelTypeId: 2 }), { ok: false, code: "PUMP_FUEL_NOT_CONFIGURED" });
  assert.deepEqual(validatePumpFuel({ configuredFuelTypeId: 2, requestedFuelTypeId: 2 }), { ok: true });
});
