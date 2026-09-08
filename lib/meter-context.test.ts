import assert from "node:assert/strict";
import test from "node:test";
import { canCloseMeter, resolveMeterContext, resolveOpenMeterFuel, validatePumpFuel } from "./meter-context";

test("only the shift owner or owner can close an open meter", () => {
  assert.equal(canCloseMeter({ actorId: 7, actorRole: "staff", shiftOwnerId: 7, shiftStatus: "open", meterEnd: null }), true);
  assert.equal(canCloseMeter({ actorId: 9, actorRole: "manager", shiftOwnerId: 7, shiftStatus: "open", meterEnd: null }), false);
  assert.equal(canCloseMeter({ actorId: 9, actorRole: "owner", shiftOwnerId: 7, shiftStatus: "open", meterEnd: null }), true);
});

test("closed shifts and already closed meters cannot be closed again", () => {
  assert.equal(canCloseMeter({ actorId: 7, actorRole: "staff", shiftOwnerId: 7, shiftStatus: "closed", meterEnd: null }), false);
  assert.equal(canCloseMeter({ actorId: 7, actorRole: "staff", shiftOwnerId: 7, shiftStatus: "open", meterEnd: 10.5 }), false);
});

test("does not silently move a sale to another shift or pump", () => {
  assert.deepEqual(resolveMeterContext({ expectedShiftId: 4, expectedPumpId: 2, shiftId: 4, pumpId: 2 }), { ok: true });
  assert.deepEqual(resolveMeterContext({ expectedShiftId: 4, expectedPumpId: 2, shiftId: 5, pumpId: 2 }), { ok: false, code: "EXPECTED_SHIFT_NOT_OPEN" });
  assert.deepEqual(resolveMeterContext({ expectedShiftId: 4, expectedPumpId: 2, shiftId: 4, pumpId: 3 }), { ok: false, code: "EXPECTED_PUMP_MISMATCH" });
});

test("rejects a pump configured for a different fuel", () => {
  assert.deepEqual(validatePumpFuel({ configuredFuelTypeId: 1, requestedFuelTypeId: 2 }), { ok: false, code: "METER_FUEL_MISMATCH" });
  assert.deepEqual(validatePumpFuel({ configuredFuelTypeId: null, requestedFuelTypeId: 2 }), { ok: false, code: "PUMP_FUEL_NOT_CONFIGURED" });
  assert.deepEqual(validatePumpFuel({ configuredFuelTypeId: 2, requestedFuelTypeId: 2 }), { ok: true });
});

test("requires an open meter for the same fuel before a sale", () => {
  assert.deepEqual(resolveOpenMeterFuel({ openMeterFuelTypeId: null, requestedFuelTypeId: 1 }), { ok: false, code: "NO_OPEN_METER" });
  assert.deepEqual(resolveOpenMeterFuel({ openMeterFuelTypeId: 2, requestedFuelTypeId: 1 }), { ok: false, code: "METER_FUEL_MISMATCH" });
  assert.deepEqual(resolveOpenMeterFuel({ openMeterFuelTypeId: 1, requestedFuelTypeId: 1 }), { ok: true });
});
