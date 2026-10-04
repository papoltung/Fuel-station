import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { canAssignRole, isRoleAllowed, ENDPOINT_POLICIES } from "./role-policy";

test("staff and manager cannot assign roles", () => {
  assert.equal(canAssignRole({ actorId: 2, actorRole: "staff", targetId: 3, nextRole: "manager" }), false);
  assert.equal(canAssignRole({ actorId: 2, actorRole: "manager", targetId: 3, nextRole: "staff" }), false);
});

test("owner can assign another user's role", () => {
  assert.equal(canAssignRole({ actorId: 1, actorRole: "owner", targetId: 2, nextRole: "manager" }), true);
});

test("owner cannot demote their own account", () => {
  assert.equal(canAssignRole({ actorId: 1, actorRole: "owner", targetId: 1, nextRole: "staff" }), false);
});

test("RBAC matrix: owner has access to all configured endpoints", () => {
  for (const [endpoint, allowedRoles] of Object.entries(ENDPOINT_POLICIES)) {
    assert.equal(isRoleAllowed("owner", allowedRoles), true, `Owner should have access to ${endpoint}`);
  }
});

test("RBAC matrix: manager is denied on owner-exclusive financial and stock routes", () => {
  const ownerExclusiveEndpoints = [
    "GET /api/export/sales",
    "GET /api/fuel-stock",
    "GET /api/fuel-stock/compare",
    "GET /api/purchases",
    "POST /api/purchases",
    "PATCH /api/purchases/[id]",
    "DELETE /api/purchases/[id]",
    "GET /api/stock-checks",
    "POST /api/stock-checks",
    "DELETE /api/stock-checks/[id]",
    "GET /api/supplier-debts",
    "POST /api/supplier-debts",
    "PATCH /api/supplier-debts/[id]",
    "DELETE /api/supplier-debts/[id]",
    "DELETE /api/supplier-debts/[id]/payments/[paymentId]",
    "DELETE /api/fuel-types/[id]",
    "PATCH /api/pumps/[id]",
    "DELETE /api/meter-periods/[id]",
    "PATCH /api/users",
  ] as const;

  for (const endpoint of ownerExclusiveEndpoints) {
    const roles = ENDPOINT_POLICIES[endpoint];
    assert.equal(isRoleAllowed("manager", roles), false, `Manager should be denied on ${endpoint}`);
  }
});

test("RBAC matrix: staff is denied on manager and owner administrative operations", () => {
  const staffForbiddenEndpoints = [
    "GET /api/sales/[id]",
    "PATCH /api/sales/[id]",
    "DELETE /api/sales/[id]",
    "GET /api/export/sales",
    "DELETE /api/product-sales/[id]",
    "POST /api/products",
    "PATCH /api/products/[id]",
    "DELETE /api/products/[id]",
    "POST /api/products/[id]/image",
    "DELETE /api/products/[id]/image",
    "GET /api/fuel-stock",
    "GET /api/fuel-stock/compare",
    "GET /api/purchases",
    "POST /api/purchases",
    "PATCH /api/purchases/[id]",
    "DELETE /api/purchases/[id]",
    "GET /api/stock-checks",
    "POST /api/stock-checks",
    "DELETE /api/stock-checks/[id]",
    "GET /api/supplier-debts",
    "POST /api/supplier-debts",
    "PATCH /api/supplier-debts/[id]",
    "DELETE /api/supplier-debts/[id]",
    "DELETE /api/supplier-debts/[id]/payments/[paymentId]",
    "PATCH /api/fuel-types",
    "PATCH /api/fuel-types/[id]",
    "DELETE /api/fuel-types/[id]",
    "PATCH /api/pumps/[id]",
    "DELETE /api/meter-periods/[id]",
    "DELETE /api/cash-counts/[id]",
    "GET /api/audit-log",
    "GET /api/users",
    "PATCH /api/users",
  ] as const;

  for (const endpoint of staffForbiddenEndpoints) {
    const roles = ENDPOINT_POLICIES[endpoint];
    assert.equal(isRoleAllowed("staff", roles), false, `Staff should be denied on ${endpoint}`);
  }
});

test("RBAC matrix: staff can access daily frontline sales and metering operations", () => {
  const staffAllowedEndpoints = [
    "GET /api/sales",
    "POST /api/sales",
    "GET /api/sales/summary",
    "GET /api/product-sales",
    "POST /api/product-sales",
    "GET /api/products",
    "GET /api/fuel-types",
    "GET /api/pumps",
    "GET /api/meter-periods",
    "POST /api/meter-periods",
    "PATCH /api/meter-periods/[id]",
    "GET /api/cash-counts",
    "POST /api/cash-counts",
    "GET /api/sale-orders",
    "POST /api/sale-orders",
    "PATCH /api/sale-orders/[id]",
    "GET /api/dashboard",
  ] as const;

  for (const endpoint of staffAllowedEndpoints) {
    const roles = ENDPOINT_POLICIES[endpoint];
    assert.equal(isRoleAllowed("staff", roles), true, `Staff should be allowed on ${endpoint}`);
  }
});

test("Architecture invariant: every API route handler enforces server-side authentication or explicit allowlist", () => {
  const apiDir = path.resolve(__dirname, "../app/api");

  // Every API route must be either:
  // A. Explicitly protected by requireRole(...)
  // OR
  // B. Explicitly declared in EXPLICIT_AUTH_EXCEPTIONS
  // Never implicitly public.
  const EXPLICIT_AUTH_EXCEPTIONS = new Map<string, string>([
    ["app/api/me/route.ts", "currentAppUser"], // Authenticated profile endpoint returning caller's AppUser info
  ]);

  function scanDir(dir: string): string[] {
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...scanDir(fullPath));
      } else if (entry.name === "route.ts") {
        files.push(fullPath);
      }
    }
    return files;
  }

  const routeFiles = scanDir(apiDir);
  assert.ok(routeFiles.length >= 30, `Expected at least 30 API route files, found ${routeFiles.length}`);

  const HTTP_METHODS = ["GET", "POST", "PATCH", "DELETE", "PUT"] as const;

  for (const routeFile of routeFiles) {
    const relPath = path.relative(path.resolve(__dirname, ".."), routeFile).replace(/\\/g, "/");
    const content = fs.readFileSync(routeFile, "utf8");

    for (const method of HTTP_METHODS) {
      const methodRegex = new RegExp(`export\\s+async\\s+function\\s+${method}\\b`, "g");
      if (methodRegex.test(content)) {
        const expectedSpecialAuth = EXPLICIT_AUTH_EXCEPTIONS.get(relPath);
        if (expectedSpecialAuth) {
          assert.ok(
            content.includes(expectedSpecialAuth),
            `${relPath} [${method}] must use explicit exception '${expectedSpecialAuth}'`
          );
        } else {
          assert.ok(
            content.includes("requireRole"),
            `${relPath} [${method}] must enforce requireRole (or be registered in EXPLICIT_AUTH_EXCEPTIONS)`
          );
        }
      }
    }
  }
});
