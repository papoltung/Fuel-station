import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  validateRestoreTarget,
  verifyDumpIntegrity,
  compareRowCounts,
} from "./restore-safety";

test("1. missing RESTORE_DRILL_DATABASE_URL -> refuse", () => {
  const res = validateRestoreTarget({
    restoreUrl: "",
    allowDisposable: true,
  });
  assert.equal(res.safe, false);
  assert.match(res.reason ?? "", /RESTORE_DRILL_DATABASE_URL is missing/);
});

test("2. production DIRECT_URL -> refuse", () => {
  const prodDirect = "postgresql://postgres.doglpjixsyuhtabaxmib:pass@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres";
  const res = validateRestoreTarget({
    restoreUrl: prodDirect,
    allowDisposable: true,
    directUrl: prodDirect,
  });
  assert.equal(res.safe, false);
  assert.match(res.reason ?? "", /matches production DIRECT_URL/);
});

test("3. production DATABASE_URL -> refuse", () => {
  const prodDb = "postgresql://postgres.doglpjixsyuhtabaxmib:pass@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true";
  const res = validateRestoreTarget({
    restoreUrl: prodDb,
    allowDisposable: true,
    databaseUrl: prodDb,
  });
  assert.equal(res.safe, false);
  assert.match(res.reason ?? "", /matches production DATABASE_URL/);
});

test("4. known production Supabase project ref -> refuse", () => {
  const res = validateRestoreTarget({
    restoreUrl: "postgresql://postgres:secret@custom-host.com:5432/db_doglpjixsyuhtabaxmib_test",
    allowDisposable: true,
    knownProdRef: "doglpjixsyuhtabaxmib",
  });
  assert.equal(res.safe, false);
  assert.match(res.reason ?? "", /contains production Supabase project reference/);
});

test("5. ALLOW_DISPOSABLE_RESTORE missing -> refuse", () => {
  const res = validateRestoreTarget({
    restoreUrl: "postgresql://postgres:postgres@localhost:5432/disposable_db",
    allowDisposable: false,
  });
  assert.equal(res.safe, false);
  assert.match(res.reason ?? "", /ALLOW_DISPOSABLE_RESTORE=true is required/);
});

test("6. checksum mismatch -> refuse", () => {
  const tempFile = path.join(os.tmpdir(), `test_dump_checksum_${Date.now()}.dump`);
  fs.writeFileSync(tempFile, "actual content");
  try {
    const res = verifyDumpIntegrity(tempFile, "wrong_sha256_hash_12345");
    assert.equal(res.valid, false);
    assert.match(res.reason ?? "", /SHA-256 mismatch/);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test("7. missing dump -> refuse", () => {
  const nonExistent = path.join(os.tmpdir(), `missing_${Date.now()}.dump`);
  const res = verifyDumpIntegrity(nonExistent);
  assert.equal(res.valid, false);
  assert.match(res.reason ?? "", /not found/);
});

test("8. zero-byte dump -> refuse", () => {
  const tempFile = path.join(os.tmpdir(), `zero_byte_${Date.now()}.dump`);
  fs.writeFileSync(tempFile, Buffer.alloc(0));
  try {
    const res = verifyDumpIntegrity(tempFile);
    assert.equal(res.valid, false);
    assert.match(res.reason ?? "", /0 bytes/);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test("9. disposable local DB (127.0.0.1) -> allowed", () => {
  const res = validateRestoreTarget({
    restoreUrl: "postgresql://postgres:pass@127.0.0.1:54333/fuel_station_restore_drill",
    allowDisposable: "true",
  });
  assert.equal(res.safe, true);
  assert.equal(res.reason, undefined);
});

test("10. localhost allowed", () => {
  const res = validateRestoreTarget({
    restoreUrl: "postgresql://postgres:pass@localhost:5432/test_db",
    allowDisposable: true,
  });
  assert.equal(res.safe, true);
});

test("11. ::1 (IPv6 loopback) allowed", () => {
  const res = validateRestoreTarget({
    restoreUrl: "postgresql://postgres:pass@[::1]:54333/test_db",
    allowDisposable: true,
  });
  assert.equal(res.safe, true);
});

test("12. arbitrary remote PostgreSQL host rejected", () => {
  const res = validateRestoreTarget({
    restoreUrl: "postgresql://postgres:secret@db.mycompany.internal:5432/my_db",
    allowDisposable: true,
  });
  assert.equal(res.safe, false);
  assert.match(res.reason ?? "", /local loopback only/);
});

test("13. AWS/RDS-style host rejected", () => {
  const res = validateRestoreTarget({
    restoreUrl: "postgresql://admin:secret@prod-instance.c123456.ap-southeast-2.rds.amazonaws.com:5432/fuel_station",
    allowDisposable: true,
  });
  assert.equal(res.safe, false);
  assert.match(res.reason ?? "", /local loopback only/);
});

test("14. Neon-style host rejected", () => {
  const res = validateRestoreTarget({
    restoreUrl: "postgresql://neon_user:secret@ep-cool-butterfly-12345.us-east-2.aws.neon.tech/neondb",
    allowDisposable: true,
  });
  assert.equal(res.safe, false);
  assert.match(res.reason ?? "", /local loopback only/);
});

test("15. unknown IP other than loopback rejected", () => {
  const res = validateRestoreTarget({
    restoreUrl: "postgresql://postgres:secret@192.168.1.100:5432/remote_db",
    allowDisposable: true,
  });
  assert.equal(res.safe, false);
  assert.match(res.reason ?? "", /local loopback only/);
});

test("16. failed pg_restore -> failure (handled cleanly)", () => {
  const res = verifyDumpIntegrity("non-existent-archive.dump");
  assert.equal(res.valid, false);
});

test("17. row count mismatch -> detected", () => {
  const prod = { Sale: 17, FuelStock: 2, Product: 20 };
  const restored = { Sale: 16, FuelStock: 2, Product: 20 };

  const res = compareRowCounts(prod, restored);
  assert.equal(res.match, false);
  assert.equal(res.details.Sale.match, false);
  assert.equal(res.details.FuelStock.match, true);
});

test("18. required table missing -> detected", () => {
  const prod = { Sale: 17, FuelStock: 2, Product: 20, MeterPeriod: 5 };
  const restored = { Sale: 17, FuelStock: 2, Product: 20 };

  const res = compareRowCounts(prod, restored);
  assert.equal(res.match, false);
  assert.equal(res.details.MeterPeriod.match, false);
  assert.equal(res.details.MeterPeriod.restored, 0);
});
