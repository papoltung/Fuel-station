export function isOwnerStockPath(path: string) {
  return ["/stock", "/purchases", "/api/fuel-stock", "/api/stock-checks", "/api/purchases"]
    .some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}
