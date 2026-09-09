import assert from "node:assert/strict";
import test from "node:test";

import { isSameSaleRequest, parseOptionalPositiveInteger, parseSaleInput } from "./sale-input";

test("distinguishes an absent pump from an invalid supplied pump", () => {
  assert.equal(parseOptionalPositiveInteger(undefined), undefined);
  assert.equal(parseOptionalPositiveInteger(null), undefined);
  assert.equal(parseOptionalPositiveInteger(2), 2);
  assert.throws(() => parseOptionalPositiveInteger(0));
  assert.throws(() => parseOptionalPositiveInteger("bad"));
});

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

test("parses a quick fuel sale without a pump", () => {
  const parsed = parseSaleInput({
    clientRequestId: "quick-1",
    sellerName: "Papol",
    fuelTypeId: 2,
    pricePerLiter: 39,
    totalAmount: 50,
    paymentMethod: "cash",
  });
  assert.equal(parsed.pumpNo, null);
  assert.equal(parsed.totalAmount, 50);
  assert.equal(isSameSaleRequest({
    ...parsed,
    pumpNo: "",
    date: new Date("2026-09-09T10:00:00.000Z"),
    pumpId: null,
  }, parsed), true);
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

test("accepts QR as a payment method", () => {
  const result = parseSaleInput({
    clientRequestId: "sale-qr",
    sellerName: "N",
    fuelTypeId: 1,
    pumpNo: "หัวจ่าย 1",
    pricePerLiter: 35,
    totalAmount: 100,
    paymentMethod: "qr",
  });
  assert.equal(result.paymentMethod, "qr");
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
