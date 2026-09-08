import test from "node:test";
import assert from "node:assert/strict";
import { isOwnerStockPath } from "./stock-access";

test("protects stock pages and APIs including nested mutations", () => {
  for (const path of ["/stock", "/stock/check", "/api/fuel-stock", "/api/fuel-stock/compare", "/api/stock-checks/12", "/purchases/new", "/api/purchases/1"]) assert.equal(isOwnerStockPath(path), true);
});
test("does not block normal sale or meter workflow", () => {
  for (const path of ["/quick", "/api/sales", "/meter", "/api/meter-periods", "/api/fuel-types", "/stockholm"]) assert.equal(isOwnerStockPath(path), false);
});
