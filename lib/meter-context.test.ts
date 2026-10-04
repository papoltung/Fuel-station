import assert from "node:assert/strict";
import test from "node:test";
import { canCloseMeter, validatePumpFuel } from "./meter-context";

test("only the user who opened the meter or an owner can close an open meter", () => {
  assert.equal(canCloseMeter({ actorId: 7, actorRole: "staff", openedById: 7, meterEnd: null }), true);
  assert.equal(canCloseMeter({ actorId: 9, actorRole: "manager", openedById: 7, meterEnd: null }), false);
  assert.equal(canCloseMeter({ actorId: 9, actorRole: "owner", openedById: 7, meterEnd: null }), true);
});

test("already closed meters cannot be closed again", () => {
  assert.equal(canCloseMeter({ actorId: 7, actorRole: "staff", openedById: 7, meterEnd: 10.5 }), false);
  assert.equal(canCloseMeter({ actorId: 9, actorRole: "owner", openedById: 7, meterEnd: 10.5 }), false);
});

test("rejects a pump configured for a different fuel", () => {
  assert.deepEqual(validatePumpFuel({ configuredFuelTypeId: 1, requestedFuelTypeId: 2 }), { ok: false, code: "METER_FUEL_MISMATCH" });
  assert.deepEqual(validatePumpFuel({ configuredFuelTypeId: null, requestedFuelTypeId: 2 }), { ok: false, code: "PUMP_FUEL_NOT_CONFIGURED" });
  assert.deepEqual(validatePumpFuel({ configuredFuelTypeId: 2, requestedFuelTypeId: 2 }), { ok: true });
});
