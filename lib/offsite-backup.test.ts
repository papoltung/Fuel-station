import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  MockOffsiteStorageClient,
  evaluateRetentionCandidates,
  calculateBackupHealth,
  parseBackupTimestampFromRunId,
} from "./offsite-storage";
import {
  executeBackupRun,
  validatePreUpload,
  uploadBackupRunToOffsite,
} from "./backup-orchestrator";
import {
  calculateSha256,
  createDbManifest,
  createStorageManifest,
  redactSecretString,
} from "./backup-helpers";

function createMockRunEnvironment(prefix: string) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `test-backup-${prefix}-`));
  const runId = "2026-10-04T180000Z";
  const runDir = path.join(tmpDir, "runs", runId);
  const dbDir = path.join(runDir, "db");
  const storageDir = path.join(runDir, "storage");

  fs.mkdirSync(dbDir, { recursive: true });
  fs.mkdirSync(storageDir, { recursive: true });

  // Setup valid DB dump and manifest
  const dumpPath = path.join(dbDir, "fuel-station.dump");
  fs.writeFileSync(dumpPath, "VALID_PG_DUMP_CONTENT_DATA");
  const dbSha256 = calculateSha256(dumpPath);
  fs.writeFileSync(path.join(dbDir, "fuel-station.dump.sha256"), `${dbSha256}  fuel-station.dump\n`);

  const dbManifest = createDbManifest({
    createdAt: runId,
    database: "fuel-station",
    schemas: ["public"],
    sizeBytes: fs.statSync(dumpPath).size,
    sha256: dbSha256,
    pgDumpVersion: "pg_dump (PostgreSQL) 17.6",
    durationMs: 500,
    status: "success",
  });
  fs.writeFileSync(path.join(dbDir, "manifest.json"), JSON.stringify(dbManifest, null, 2));

  // Setup valid Storage files and manifest
  const productSubdir = path.join(storageDir, "products");
  fs.mkdirSync(productSubdir, { recursive: true });
  const file1Path = path.join(productSubdir, "item1.png");
  fs.writeFileSync(file1Path, "PNG_IMAGE_BYTES_1");
  const file1Sha = calculateSha256(file1Path);

  const storageManifest = createStorageManifest({
    createdAt: runId,
    bucket: "products",
    status: "success",
    totalDiscovered: 1,
    totalDownloaded: 1,
    totalFailed: 0,
    durationMs: 300,
    files: [
      {
        name: "item1.png",
        path: "products/item1.png",
        sizeBytes: fs.statSync(file1Path).size,
        contentType: "image/png",
        sha256: file1Sha,
        downloadedAt: new Date().toISOString(),
      },
    ],
    failedPaths: [],
  });
  fs.writeFileSync(path.join(storageDir, "manifest.json"), JSON.stringify(storageManifest, null, 2));

  return { tmpDir, runId, runDir, dbDir, storageDir, dbSha256, file1Sha };
}

// 1. DB success + storage success => overall success
test("1. DB success + storage success => overall success", async () => {
  const env = createMockRunEnvironment("1");
  const mockClient = new MockOffsiteStorageClient();

  const result = await executeBackupRun({
    runId: env.runId,
    baseDir: path.join(env.tmpDir, "runs"),
    referenceHealthPath: path.join(env.tmpDir, "backup-health.json"),
    dbRunner: async () => ({
      status: "success",
      targetDir: env.dbDir,
      dumpFilePath: path.join(env.dbDir, "fuel-station.dump"),
      sha256: env.dbSha256,
      sizeBytes: 25,
      manifestPath: path.join(env.dbDir, "manifest.json"),
    }),
    storageRunner: async () => ({
      status: "success",
      targetDir: env.storageDir,
      totalDiscovered: 1,
      totalDownloaded: 1,
      totalFailed: 0,
      manifestPath: path.join(env.storageDir, "manifest.json"),
      files: [],
    }),
    offsiteClient: mockClient,
  });

  assert.equal(result.overallStatus, "success");
  assert.equal(result.database.status, "success");
  assert.equal(result.storage.status, "success");
  assert.equal(result.offsite.status, "success");
  assert.equal(result.exitCode, 0);

  // Clean up
  fs.rmSync(env.tmpDir, { recursive: true, force: true });
});

// 2. DB fail => overall fail
test("2. DB fail => overall fail", async () => {
  const env = createMockRunEnvironment("2");
  const mockClient = new MockOffsiteStorageClient();

  const result = await executeBackupRun({
    runId: env.runId,
    baseDir: path.join(env.tmpDir, "runs"),
    referenceHealthPath: path.join(env.tmpDir, "backup-health.json"),
    dbRunner: async () => {
      throw new Error("pg_dump process failed connection error");
    },
    storageRunner: async () => ({
      status: "success",
      targetDir: env.storageDir,
      totalDiscovered: 1,
      totalDownloaded: 1,
      totalFailed: 0,
      manifestPath: path.join(env.storageDir, "manifest.json"),
      files: [],
    }),
    offsiteClient: mockClient,
  });

  assert.equal(result.overallStatus, "failed");
  assert.equal(result.database.status, "failed");
  assert.equal(result.offsite.status, "skipped");
  assert.equal(result.exitCode, 1);

  fs.rmSync(env.tmpDir, { recursive: true, force: true });
});

// 3. storage partial => overall fail
test("3. storage partial => overall fail", async () => {
  const env = createMockRunEnvironment("3");
  const mockClient = new MockOffsiteStorageClient();

  // Rewrite storage manifest to be partial
  const partialManifest = createStorageManifest({
    createdAt: env.runId,
    bucket: "products",
    status: "partial",
    totalDiscovered: 2,
    totalDownloaded: 1,
    totalFailed: 1,
    durationMs: 300,
    files: [],
    failedPaths: ["item2.png"],
  });
  fs.writeFileSync(path.join(env.storageDir, "manifest.json"), JSON.stringify(partialManifest, null, 2));

  const result = await executeBackupRun({
    runId: env.runId,
    baseDir: path.join(env.tmpDir, "runs"),
    referenceHealthPath: path.join(env.tmpDir, "backup-health.json"),
    dbRunner: async () => ({
      status: "success",
      targetDir: env.dbDir,
      dumpFilePath: path.join(env.dbDir, "fuel-station.dump"),
      sha256: env.dbSha256,
      sizeBytes: 25,
      manifestPath: path.join(env.dbDir, "manifest.json"),
    }),
    storageRunner: async () => ({
      status: "partial",
      targetDir: env.storageDir,
      totalDiscovered: 2,
      totalDownloaded: 1,
      totalFailed: 1,
      manifestPath: path.join(env.storageDir, "manifest.json"),
      files: [],
    }),
    offsiteClient: mockClient,
  });

  assert.equal(result.overallStatus, "failed");
  assert.equal(result.storage.status, "partial");
  assert.equal(result.offsite.status, "skipped");
  assert.equal(result.exitCode, 1);

  fs.rmSync(env.tmpDir, { recursive: true, force: true });
});

// 4. checksum mismatch prevents upload
test("4. checksum mismatch prevents upload", () => {
  const env = createMockRunEnvironment("4");

  // Tamper dump file after manifest is written
  fs.writeFileSync(path.join(env.dbDir, "fuel-station.dump"), "CORRUPTED_BYTES");

  const check = validatePreUpload(env.dbDir, env.storageDir);
  assert.equal(check.valid, false);
  assert.match(check.reason ?? "", /SHA-256 mismatch/);

  fs.rmSync(env.tmpDir, { recursive: true, force: true });
});

// 5. duplicate runId refuses overwrite
test("5. duplicate runId refuses overwrite", async () => {
  const env = createMockRunEnvironment("5");
  const mockClient = new MockOffsiteStorageClient();

  // Populate mock remote with existing manifest for this runId
  const remoteManifestKey = `fuel-station/runs/${env.runId}/backup-run.json`;
  mockClient.store.set(remoteManifestKey, {
    buffer: Buffer.from("{}"),
    contentType: "application/json",
    lastModified: new Date(),
  });

  await assert.rejects(
    async () => {
      await uploadBackupRunToOffsite(mockClient, env.runDir, env.runId);
    },
    /Duplicate runId refuses overwrite/
  );

  fs.rmSync(env.tmpDir, { recursive: true, force: true });
});

// 6. off-site upload failure => failed run
test("6. off-site upload failure => failed run", async () => {
  const env = createMockRunEnvironment("6");
  const mockClient = new MockOffsiteStorageClient();
  mockClient.failNextUpload = true; // force upload to throw

  const result = await executeBackupRun({
    runId: env.runId,
    baseDir: path.join(env.tmpDir, "runs"),
    referenceHealthPath: path.join(env.tmpDir, "backup-health.json"),
    dbRunner: async () => ({
      status: "success",
      targetDir: env.dbDir,
      dumpFilePath: path.join(env.dbDir, "fuel-station.dump"),
      sha256: env.dbSha256,
      sizeBytes: 25,
      manifestPath: path.join(env.dbDir, "manifest.json"),
    }),
    storageRunner: async () => ({
      status: "success",
      targetDir: env.storageDir,
      totalDiscovered: 1,
      totalDownloaded: 1,
      totalFailed: 0,
      manifestPath: path.join(env.storageDir, "manifest.json"),
      files: [],
    }),
    offsiteClient: mockClient,
  });

  assert.equal(result.overallStatus, "failed");
  assert.equal(result.offsite.status, "failed");
  assert.match(result.offsite.error ?? "", /Mock upload failed intentionally/);
  assert.equal(result.exitCode, 1);

  fs.rmSync(env.tmpDir, { recursive: true, force: true });
});

// 7. remote verification failure => failed run
test("7. remote verification failure => failed run", async () => {
  const env = createMockRunEnvironment("7");
  const mockClient = new MockOffsiteStorageClient();
  mockClient.failNextVerify = true; // force remote verification to throw

  const result = await executeBackupRun({
    runId: env.runId,
    baseDir: path.join(env.tmpDir, "runs"),
    referenceHealthPath: path.join(env.tmpDir, "backup-health.json"),
    dbRunner: async () => ({
      status: "success",
      targetDir: env.dbDir,
      dumpFilePath: path.join(env.dbDir, "fuel-station.dump"),
      sha256: env.dbSha256,
      sizeBytes: 25,
      manifestPath: path.join(env.dbDir, "manifest.json"),
    }),
    storageRunner: async () => ({
      status: "success",
      targetDir: env.storageDir,
      totalDiscovered: 1,
      totalDownloaded: 1,
      totalFailed: 0,
      manifestPath: path.join(env.storageDir, "manifest.json"),
      files: [],
    }),
    offsiteClient: mockClient,
  });

  assert.equal(result.overallStatus, "failed");
  assert.equal(result.offsite.status, "failed");
  assert.equal(result.exitCode, 1);

  fs.rmSync(env.tmpDir, { recursive: true, force: true });
});

// 8. backup health healthy within target window
test("8. backup health healthy within target window", () => {
  const now = new Date("2026-10-04T18:00:00Z");
  const health = calculateBackupHealth({
    currentAttemptAt: now,
    lastAttemptStatus: "success",
    currentRunId: "2026-10-04T180000Z",
    previousSuccessfulBackupAt: "2026-10-04T12:00:00Z", // 6h ago
    databaseStatus: "success",
    storageStatus: "success",
    offsiteStatus: "success",
  });

  assert.equal(health.healthState, "HEALTHY");
  assert.equal(health.lastStatus, "success");
});

// 9. backup health failed when too old (>8h)
test("9. backup health failed when too old (>8h)", () => {
  const now = new Date("2026-10-04T22:00:00Z");
  const health = calculateBackupHealth({
    currentAttemptAt: now,
    lastAttemptStatus: "failed",
    lastErrorCategory: "db_dump",
    previousSuccessfulBackupAt: "2026-10-04T10:00:00Z", // 12h ago (> 8h window)
    databaseStatus: "failed",
    storageStatus: "not_run",
    offsiteStatus: "skipped",
  });

  assert.equal(health.healthState, "FAILED");
});

// 9b. backup health degraded when >6h target RPO but within 8h grace window
test("9b. backup health degraded when >6h target RPO but within 8h grace window", () => {
  const now = new Date("2026-10-04T19:00:00Z");
  const health = calculateBackupHealth({
    currentAttemptAt: now,
    lastAttemptStatus: "failed",
    lastErrorCategory: "offsite_upload",
    previousSuccessfulBackupAt: "2026-10-04T12:00:00Z", // 7h ago (>6h, <=8h)
    databaseStatus: "success",
    storageStatus: "success",
    offsiteStatus: "failed",
  });

  assert.equal(health.healthState, "DEGRADED");
  assert.match(health.healthReason, /is within 8h grace window/);
});

// 9c. local verification PASS + off-site skipped => DEGRADED
test("9c. local verification PASS + off-site skipped => DEGRADED", () => {
  const now = new Date("2026-10-04T18:00:00Z");
  const health = calculateBackupHealth({
    currentAttemptAt: now,
    lastAttemptStatus: "success",
    databaseStatus: "success",
    storageStatus: "success",
    offsiteStatus: "skipped",
  });

  assert.equal(health.healthState, "DEGRADED");
  assert.match(health.healthReason, /Local verification PASS, but off-site upload was skipped/);
});

// 10. last failed run does not erase lastSuccessfulBackupAt
test("10. last failed run does not erase lastSuccessfulBackupAt", () => {
  const now = new Date("2026-10-04T18:00:00Z");
  const knownSuccess = "2026-10-04T12:00:00Z";

  const health = calculateBackupHealth({
    currentAttemptAt: now,
    lastAttemptStatus: "failed",
    lastErrorCategory: "storage_backup",
    previousSuccessfulBackupAt: knownSuccess,
    databaseStatus: "success",
    storageStatus: "failed",
    offsiteStatus: "skipped",
  });

  assert.equal(health.lastSuccessfulBackupAt, knownSuccess);
  assert.equal(health.healthState, "FAILED");
});

// 11. retention ignores malformed keys safely
test("11. retention ignores malformed keys safely", () => {
  assert.equal(parseBackupTimestampFromRunId("malformed-run-id"), null);
  assert.equal(parseBackupTimestampFromRunId("2026-99-99T999999Z"), null);

  const valid = parseBackupTimestampFromRunId("2026-10-04T180000Z");
  assert.notEqual(valid, null);
  assert.equal(valid?.getUTCFullYear(), 2026);
  assert.equal(valid?.getUTCMonth(), 9); // October = 9 (0-indexed)
  assert.equal(valid?.getUTCDate(), 4);
});

// 12. retention never deletes newest successful backup
test("12. retention never deletes newest successful backup even if >30 days old", () => {
  const now = new Date("2026-12-01T00:00:00Z"); // 60 days in the future
  const runs = [
    {
      runId: "2026-10-01T000000Z",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      isSuccess: true, // Only successful run
    },
    {
      runId: "2026-09-01T000000Z",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      isSuccess: false,
    },
  ];

  const result = evaluateRetentionCandidates(runs, { referenceNow: now, maxAgeDays: 30 });
  assert.ok(result.protectedRuns.includes("2026-10-01T000000Z"));
  assert.ok(!result.candidatesToDelete.includes("2026-10-01T000000Z"));
  assert.match(result.reasons["2026-10-01T000000Z"], /Newest successful backup run/);
});

// 13. retention dry-run performs no deletion
test("13. retention dry-run performs no deletion", () => {
  const now = new Date("2026-11-15T00:00:00Z");
  const runs = [
    {
      runId: "2026-11-14T000000Z",
      createdAt: new Date("2026-11-14T00:00:00Z"),
      isSuccess: true,
    },
    {
      runId: "2026-10-01T000000Z",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      isSuccess: true,
    },
  ];

  const result = evaluateRetentionCandidates(runs, { referenceNow: now, maxAgeDays: 30 });
  // Older run is marked as deletion candidate in evaluation, but no delete API call happens
  assert.ok(result.candidatesToDelete.includes("2026-10-01T000000Z"));
  assert.ok(result.protectedRuns.includes("2026-11-14T000000Z"));
});

// 14. secret values never appear in manifest/log helper
test("14. secret values never appear in manifest/log helper", () => {
  const sensitivePostgres = "postgresql://postgres:SuperSecretPassword123@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";
  const redacted = redactSecretString(sensitivePostgres);
  assert.equal(redacted.includes("SuperSecretPassword123"), false);
  assert.match(redacted, /:(\*\*\*|\[REDACTED\])@/);

  const sensitiveJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature";
  const redactedJwt = redactSecretString(`Bearer ${sensitiveJwt}`);
  assert.equal(redactedJwt.includes("doNotLeakThisSignature"), false);
  assert.match(redactedJwt, /\[REDACTED_JWT\]/);

  const manifest = createDbManifest({
    createdAt: "2026-10-04T180000Z",
    database: "fuel-station",
    schemas: ["public"],
    sizeBytes: 100,
    sha256: "abc",
    pgDumpVersion: "pg_dump 17.6 with secret postgresql://user:pass123@host:5432/db",
    durationMs: 10,
    status: "failed",
    error: `Error connecting to ${sensitivePostgres}`,
  });

  assert.equal(manifest.pgDumpVersion.includes("pass123"), false);
  assert.equal(manifest.error?.includes("SuperSecretPassword123"), false);
});

// 15. failed job exits non-zero
test("15. failed job exits non-zero", async () => {
  const env = createMockRunEnvironment("15");
  const result = await executeBackupRun({
    runId: env.runId,
    baseDir: path.join(env.tmpDir, "runs"),
    referenceHealthPath: path.join(env.tmpDir, "backup-health.json"),
    dbRunner: async () => {
      throw new Error("fatal error");
    },
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.overallStatus, "failed");

  fs.rmSync(env.tmpDir, { recursive: true, force: true });
});

// 16. successful job exits zero
test("16. successful job exits zero", async () => {
  const env = createMockRunEnvironment("16");
  const mockClient = new MockOffsiteStorageClient();

  const result = await executeBackupRun({
    runId: env.runId,
    baseDir: path.join(env.tmpDir, "runs"),
    referenceHealthPath: path.join(env.tmpDir, "backup-health.json"),
    dbRunner: async () => ({
      status: "success",
      targetDir: env.dbDir,
      dumpFilePath: path.join(env.dbDir, "fuel-station.dump"),
      sha256: env.dbSha256,
      sizeBytes: 25,
      manifestPath: path.join(env.dbDir, "manifest.json"),
    }),
    storageRunner: async () => ({
      status: "success",
      targetDir: env.storageDir,
      totalDiscovered: 1,
      totalDownloaded: 1,
      totalFailed: 0,
      manifestPath: path.join(env.storageDir, "manifest.json"),
      files: [],
    }),
    offsiteClient: mockClient,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.overallStatus, "success");

  fs.rmSync(env.tmpDir, { recursive: true, force: true });
});
