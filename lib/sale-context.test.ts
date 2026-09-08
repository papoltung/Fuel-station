import assert from "node:assert/strict";
import test from "node:test";
import { resolveCachedSaleContext, type SaleContext } from "./sale-context";

const cached: SaleContext = { authUserId: "user-a", shiftId: 12 };

test("allows an already verified context to enqueue while the network is unavailable", () => {
  assert.deepEqual(resolveCachedSaleContext(cached, "user-a"), cached);
});

test("does not reuse a cached context for another signed-in user", () => {
  assert.equal(resolveCachedSaleContext(cached, "user-b"), null);
});

test("rejects malformed or missing cached context", () => {
  assert.equal(resolveCachedSaleContext(null, "user-a"), null);
  assert.equal(resolveCachedSaleContext({ authUserId: "user-a", shiftId: 0 }, "user-a"), null);
});
