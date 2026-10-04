export type AssignableRole = "owner" | "manager" | "staff";

export function canAssignRole(input: {
  actorId: number;
  actorRole: string;
  targetId: number;
  nextRole: AssignableRole;
}) {
  if (input.actorRole !== "owner") return false;
  if (input.actorId === input.targetId && input.nextRole !== "owner") return false;
  return true;
}

export function isRoleAllowed(role: string, allowedRoles: readonly AssignableRole[]): boolean {
  return allowedRoles.includes(role as AssignableRole);
}

export const ENDPOINT_POLICIES = {
  // Fuel Sales
  "GET /api/sales": ["owner", "manager", "staff"],
  "POST /api/sales": ["owner", "manager", "staff"],
  "GET /api/sales/[id]": ["owner", "manager"],
  "PATCH /api/sales/[id]": ["owner", "manager"],
  "DELETE /api/sales/[id]": ["owner", "manager"],
  "GET /api/sales/summary": ["owner", "manager", "staff"],
  "GET /api/export/sales": ["owner"],

  // Product Sales & Products
  "GET /api/product-sales": ["owner", "manager", "staff"],
  "POST /api/product-sales": ["owner", "manager", "staff"],
  "DELETE /api/product-sales/[id]": ["owner", "manager"],
  "GET /api/products": ["owner", "manager", "staff"],
  "POST /api/products": ["owner", "manager"],
  "PATCH /api/products/[id]": ["owner", "manager"],
  "DELETE /api/products/[id]": ["owner", "manager"],
  "POST /api/products/[id]/image": ["owner", "manager"],
  "DELETE /api/products/[id]/image": ["owner", "manager"],

  // Fuel Stock, Purchases, Dips & Debt
  "GET /api/fuel-stock": ["owner"],
  "GET /api/fuel-stock/compare": ["owner"],
  "GET /api/purchases": ["owner"],
  "POST /api/purchases": ["owner"],
  "PATCH /api/purchases/[id]": ["owner"],
  "DELETE /api/purchases/[id]": ["owner"],
  "GET /api/stock-checks": ["owner"],
  "POST /api/stock-checks": ["owner"],
  "DELETE /api/stock-checks/[id]": ["owner"],
  "GET /api/supplier-debts": ["owner"],
  "POST /api/supplier-debts": ["owner"],
  "PATCH /api/supplier-debts/[id]": ["owner"],
  "DELETE /api/supplier-debts/[id]": ["owner"],
  "DELETE /api/supplier-debts/[id]/payments/[paymentId]": ["owner"],

  // Meters & Hardware
  "GET /api/fuel-types": ["owner", "manager", "staff"],
  "PATCH /api/fuel-types": ["owner", "manager"],
  "PATCH /api/fuel-types/[id]": ["owner", "manager"],
  "DELETE /api/fuel-types/[id]": ["owner"],
  "GET /api/pumps": ["owner", "manager", "staff"],
  "PATCH /api/pumps/[id]": ["owner"],
  "GET /api/meter-periods": ["owner", "manager", "staff"],
  "POST /api/meter-periods": ["owner", "manager", "staff"],
  "PATCH /api/meter-periods/[id]": ["owner", "manager", "staff"],
  "DELETE /api/meter-periods/[id]": ["owner"],

  // Cash Counts, Sale Orders & System
  "GET /api/cash-counts": ["owner", "manager", "staff"],
  "POST /api/cash-counts": ["owner", "manager", "staff"],
  "DELETE /api/cash-counts/[id]": ["owner", "manager"],
  "GET /api/sale-orders": ["owner", "manager", "staff"],
  "POST /api/sale-orders": ["owner", "manager", "staff"],
  "PATCH /api/sale-orders/[id]": ["owner", "manager", "staff"],
  "GET /api/audit-log": ["owner", "manager"],
  "GET /api/dashboard": ["owner", "manager", "staff"],
  "GET /api/users": ["owner", "manager"],
  "PATCH /api/users": ["owner"],
} as const satisfies Record<string, readonly AssignableRole[]>;
