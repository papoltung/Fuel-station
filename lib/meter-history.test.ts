import assert from "node:assert/strict";
import test from "node:test";
import { openMeterPeriods, visibleMeterHistory } from "./meter-history";

test("shows five recent rows until the user expands the history", () => {
  const rows = [1, 2, 3, 4, 5, 6, 7];
  assert.deepEqual(visibleMeterHistory(rows, false), [1, 2, 3, 4, 5]);
  assert.deepEqual(visibleMeterHistory(rows, true), rows);
});

test("offers close controls only for meter periods that are still open", () => {
  const rows = [
    { id: 1, meterEnd: 1815107 },
    { id: 2, meterEnd: null },
  ];
  assert.deepEqual(openMeterPeriods(rows), [{ id: 2, meterEnd: null }]);
});
