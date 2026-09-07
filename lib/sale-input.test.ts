import assert from "node:assert/strict";
import test from "node:test";

import { isSameSaleRequest, parseSaleInput } from "./sale-input";

test("parses an amount sale and keeps its request id", () => {
  assert.deepEqual(
    parseSaleInput({
      clientRequestId: "7aaaf8fb-6323-4a10-9c10-9228dc69fb47",
      sellerName: "N",
      fuelTypeId: 1,
      pumpNo: "หัวจ่าย 1",
      pricePerLiter: 35,
      totalAmount: 500,
      paymentMethod: "cash",
    }),
    {
      clientRequestId: "7aaaf8fb-6323-4a10-9c10-9228dc69fb47",
      sellerName: "N",
      fuelTypeId: 1,
      pumpNo: "หัวจ่าย 1",
      pricePerLiter: 35,
      totalAmount: 500,
      liters: 500 / 35,
      paymentMethod: "cash",
      customerName: null,
      note: null,
      date: undefined,
      meterStart: null,
      meterEnd: null,
    },
  );
});

test("rejects invalid numeric and payment values", () => {
  for (const input of [
    { fuelTypeId: 1, pricePerLiter: 35, totalAmount: -1, paymentMethod: "cash" },
    { fuelTypeId: 1, pricePerLiter: "NaN", totalAmount: 100, paymentMethod: "cash" },
    { fuelTypeId: 1, pricePerLiter: 35, totalAmount: 100, paymentMethod: "unknown" },
  ]) {
    assert.throws(() => parseSaleInput({ sellerName: "N", pumpNo: "1", ...input }));
  }
});

test("requires a customer for a credit sale", () => {
  assert.throws(() =>
    parseSaleInput({
      sellerName: "N",
      fuelTypeId: 1,
      pumpNo: "1",
      pricePerLiter: 35,
      totalAmount: 100,
      paymentMethod: "credit",
    }),
  );
});

test("requires a request id so retries cannot create a second sale", () => {
  assert.throws(() =>
    parseSaleInput({
      sellerName: "N",
      fuelTypeId: 1,
      pumpNo: "1",
      pricePerLiter: 35,
      totalAmount: 100,
      paymentMethod: "cash",
    }),
  );
});

test("detects a reused request id with changed payload", () => {
  const request = parseSaleInput({
    clientRequestId: "same-request",
    sellerName: "N",
    fuelTypeId: 1,
    pumpNo: "1",
    pricePerLiter: 35,
    totalAmount: 100,
    paymentMethod: "cash",
    note: "original",
    date: "2026-09-07T10:00:00+07:00",
  });
  const existing = {
    ...request,
    id: 1,
    date: new Date(request.date!),
    note: "changed",
  };
  assert.equal(isSameSaleRequest(existing, request), false);
});
