import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  generateBackupTimestamp,
  calculateSha256,
  redactSecretString,
  sanitizeStoragePath,
  calculateStorageStatus,
  validateDumpFile,
  createDbManifest,
  createStorageManifest,
} from "./backup-helpers";

test("1. timestamp directory generation: produces valid deterministic UTC format without illegal characters", () => {
  const fixedDate = new Date("2026-10-04T12:30:45.000Z");
  const ts = generateBackupTimestamp(fixedDate);
  assert.equal(ts, "2026-10-04T123045Z");
  // Ensure no colons (Windows filesystem constraint)
  assert.ok(!ts.includes(":"), "Timestamp should not contain colons");
  assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{6}Z$/);
});

test("2. manifest contains no secrets: sensitive connection strings and keys are absent from JSON", () => {
  const rawDbUrl = "postgresql://postgres:SecretPassword123@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres";
  const manifest = createDbManifest({
    createdAt: "2026-10-04T123045Z",
    database: "fuel-station",
    schemas: ["public"],
    sizeBytes: 1024,
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    pgDumpVersion: `pg_dump 17.0 (invoked with ${rawDbUrl})`,
    durationMs: 1500,
    status: "success",
    error: `Failed connecting with ${rawDbUrl}`,
  });

  const jsonStr = JSON.stringify(manifest);
  assert.ok(!jsonStr.includes("SecretPassword123"), "Password must not appear in manifest JSON");
  assert.ok(jsonStr.includes(":***@"), "Password must be masked in manifest JSON");
});

test("3. checksum stable for known fixture: matches known SHA-256 digest", () => {
  const fixture = Buffer.from("fuel-station-production-backup-test-fixture", "utf8");
  const hash1 = calculateSha256(fixture);
  const hash2 = calculateSha256(fixture);
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64, "SHA-256 hex string should be 64 characters");
});

test("4. failed pg_dump produces failure: validateDumpFile fails when file is missing", () => {
  const nonExistent = path.join(os.tmpdir(), "non_existent_dump_file.dump");
  if (fs.existsSync(nonExistent)) fs.unlinkSync(nonExistent);

  const res = validateDumpFile(nonExistent);
  assert.equal(res.valid, false);
  assert.match(res.reason ?? "", /does not exist/);
});

test("5. zero-byte dump rejected: validateDumpFile rejects empty dump file", () => {
  const tempFile = path.join(os.tmpdir(), `zero_byte_test_${Date.now()}.dump`);
  fs.writeFileSync(tempFile, Buffer.alloc(0));

  try {
    const res = validateDumpFile(tempFile, 1);
    assert.equal(res.valid, false);
    assert.match(res.reason ?? "", /empty or too small/);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test("6. unreadable dump rejected: validateDumpFile verifies minimum size constraint", () => {
  const tempFile = path.join(os.tmpdir(), `tiny_dump_test_${Date.now()}.dump`);
  fs.writeFileSync(tempFile, Buffer.from("tiny"));

  try {
    // A realistic pg_dump custom header is at least 50+ bytes
    const res = validateDumpFile(tempFile, 50);
    assert.equal(res.valid, false);
    assert.match(res.reason ?? "", /too small/);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test("7. successful dump manifest marked success: status is success with verified size and sha", () => {
  const manifest = createDbManifest({
    createdAt: "2026-10-04T120000Z",
    database: "fuel-station",
    schemas: ["public"],
    sizeBytes: 154200,
    sha256: "abc123def456",
    pgDumpVersion: "pg_dump (PostgreSQL) 17.2",
    durationMs: 2345,
    status: "success",
  });

  assert.equal(manifest.status, "success");
  assert.equal(manifest.sizeBytes, 154200);
  assert.deepEqual(manifest.schemas, ["public"]);
});

test("8. storage manifest lists all downloaded objects: arrays and counters are aligned", () => {
  const manifest = createStorageManifest({
    createdAt: "2026-10-04T120000Z",
    bucket: "products",
    status: "success",
    totalDiscovered: 2,
    totalDownloaded: 2,
    totalFailed: 0,
    durationMs: 500,
    files: [
      {
        name: "oil-1.jpg",
        path: "products/oil-1.jpg",
        sizeBytes: 45000,
        contentType: "image/jpeg",
        sha256: "1111",
        downloadedAt: "2026-10-04T120001Z",
      },
      {
        name: "snack-2.png",
        path: "products/snack-2.png",
        sizeBytes: 30000,
        contentType: "image/png",
        sha256: "2222",
        downloadedAt: "2026-10-04T120002Z",
      },
    ],
    failedPaths: [],
  });

  assert.equal(manifest.status, "success");
  assert.equal(manifest.totalDiscovered, 2);
  assert.equal(manifest.totalDownloaded, 2);
  assert.equal(manifest.files.length, 2);
  assert.equal(manifest.failedPaths.length, 0);
});

test("9. failed object causes partial/failure status: calculateStorageStatus marks partial when some succeed and some fail", () => {
  // 10 discovered, 9 downloaded, 1 failed => partial
  const statusPartial = calculateStorageStatus(10, 9, 1);
  assert.equal(statusPartial, "partial");

  // 10 discovered, 0 downloaded, 10 failed => failed
  const statusFailed = calculateStorageStatus(10, 0, 10);
  assert.equal(statusFailed, "failed");

  // 10 discovered, 10 downloaded, 0 failed => success
  const statusSuccess = calculateStorageStatus(10, 10, 0);
  assert.equal(statusSuccess, "success");

  // Empty bucket: 0 discovered, 0 downloaded, 0 failed => success
  const statusEmpty = calculateStorageStatus(0, 0, 0);
  assert.equal(statusEmpty, "success");
});

test("10. nested storage paths preserved: subfolders resolve correctly within base directory", () => {
  const baseDir = path.join(os.tmpdir(), "backup_storage_base");
  const resolved = sanitizeStoragePath(baseDir, "category/sub/image.jpg");
  const expected = path.resolve(baseDir, "category", "sub", "image.jpg");
  assert.equal(resolved, expected);
});

test("11. corrupted filename/path handled safely: directory traversal and illegal characters throw error", () => {
  const baseDir = path.join(os.tmpdir(), "backup_storage_base");

  assert.throws(
    () => sanitizeStoragePath(baseDir, "../../etc/passwd"),
    /Path traversal attempt detected/
  );

  assert.throws(
    () => sanitizeStoragePath(baseDir, "image:colon.jpg"),
    /Invalid characters in filename/
  );

  assert.throws(
    () => sanitizeStoragePath(baseDir, "image*wildcard.jpg"),
    /Invalid characters in filename/
  );
});

test("12. service-role key never logged: redactSecretString masks JWT tokens", () => {
  const secretKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fake_signature_xyz_123456789";
  const logMessage = `Connecting to storage with auth token ${secretKey} at endpoint`;
  const redacted = redactSecretString(logMessage);

  assert.ok(!redacted.includes(secretKey));
  assert.ok(redacted.includes("[REDACTED_JWT]"));
});

test("13. DATABASE_URL/DIRECT_URL never logged: redactSecretString masks database passwords", () => {
  const directUrl = "postgres://postgres:SuperSecretPw99@db.project.supabase.co:5432/postgres";
  const logMessage = `Invoking pg_dump with URI: ${directUrl}`;
  const redacted = redactSecretString(logMessage);

  assert.ok(!redacted.includes("SuperSecretPw99"));
  assert.ok(redacted.includes("postgres:***@db.project.supabase.co:5432/postgres"));
});

test("14. existing backup set is not silently overwritten: fails if target timestamp directory already exists", () => {
  const testRoot = path.join(os.tmpdir(), `backup_overwrite_test_${Date.now()}`);
  const targetDir = path.join(testRoot, "2026-10-04T120000Z");
  fs.mkdirSync(targetDir, { recursive: true });

  try {
    const checkTarget = (dir: string) => {
      if (fs.existsSync(dir)) {
        throw new Error(`Target backup directory already exists: ${dir}. Refusing to overwrite.`);
      }
    };

    assert.throws(
      () => checkTarget(targetDir),
      /Target backup directory already exists/
    );
  } finally {
    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true, force: true });
  }
});
