import * as fs from "fs";
import * as path from "path";
import {
  calculateSha256,
  generateBackupTimestamp,
  redactSecretString,
  DbBackupManifest,
  StorageBackupManifest,
} from "./backup-helpers";
import {
  OffsiteStorageClient,
  formatRemoteRunPrefix,
  evaluateRetentionCandidates,
  calculateBackupHealth,
  BackupHealthState,
  parseBackupTimestampFromRunId,
  discoverLatestVerifiedRemoteBackup,
} from "./offsite-storage";
import { BackupDbResult } from "../scripts/backup-db";
import { BackupStorageResult } from "../scripts/backup-storage";

export interface BackupRunManifest {
  runId: string;
  createdAt: string;
  database: {
    status: "success" | "failed";
    sizeBytes: number;
    sha256: string;
    error?: string;
  };
  storage: {
    status: "success" | "partial" | "failed";
    objects: number;
    failed: number;
    error?: string;
  };
  overallStatus: "success" | "failed";
  error?: string;
}

export interface PreUploadValidationResult {
  valid: boolean;
  reason?: string;
  dbSizeBytes: number;
  dbSha256: string;
  storageObjects: number;
  storageFailed: number;
}

/**
 * Validates database and storage artifacts locally before initiating any offsite upload.
 * Strict Phase 3 invariants:
 * Database:
 *   - dump exists and size > 0
 *   - sha256 matches manifest and .sha256 file
 * Storage:
 *   - manifest exists and status === "success"
 *   - all expected files exist locally
 *   - all local file sha256 hashes match manifest
 *   - totalFailed === 0 and totalDownloaded === totalDiscovered
 */
export function validatePreUpload(dbDir: string, storageDir: string): PreUploadValidationResult {
  const dbDumpPath = path.join(dbDir, "fuel-station.dump");
  const dbSha256Path = path.join(dbDir, "fuel-station.dump.sha256");
  const dbManifestPath = path.join(dbDir, "manifest.json");

  if (!fs.existsSync(dbDumpPath)) {
    return {
      valid: false,
      reason: "Database dump file does not exist",
      dbSizeBytes: 0,
      dbSha256: "",
      storageObjects: 0,
      storageFailed: 0,
    };
  }

  const dbStat = fs.statSync(dbDumpPath);
  if (dbStat.size <= 0) {
    return {
      valid: false,
      reason: `Database dump file is empty (${dbStat.size} bytes)`,
      dbSizeBytes: dbStat.size,
      dbSha256: "",
      storageObjects: 0,
      storageFailed: 0,
    };
  }

  const computedDbSha256 = calculateSha256(dbDumpPath);

  if (fs.existsSync(dbSha256Path)) {
    const rawSha = fs.readFileSync(dbSha256Path, "utf8").trim().split(/\s+/)[0];
    if (rawSha.toLowerCase() !== computedDbSha256.toLowerCase()) {
      return {
        valid: false,
        reason: `Database SHA-256 mismatch with .sha256 file: ${computedDbSha256} vs ${rawSha}`,
        dbSizeBytes: dbStat.size,
        dbSha256: computedDbSha256,
        storageObjects: 0,
        storageFailed: 0,
      };
    }
  }

  if (fs.existsSync(dbManifestPath)) {
    try {
      const dbManifest: DbBackupManifest = JSON.parse(fs.readFileSync(dbManifestPath, "utf8"));
      if (dbManifest.status !== "success") {
        return {
          valid: false,
          reason: `Database manifest status is not success (${dbManifest.status}): ${dbManifest.error || "unknown"}`,
          dbSizeBytes: dbStat.size,
          dbSha256: computedDbSha256,
          storageObjects: 0,
          storageFailed: 0,
        };
      }
      if (dbManifest.sha256 && dbManifest.sha256.toLowerCase() !== computedDbSha256.toLowerCase()) {
        return {
          valid: false,
          reason: `Database SHA-256 mismatch with manifest: ${computedDbSha256} vs ${dbManifest.sha256}`,
          dbSizeBytes: dbStat.size,
          dbSha256: computedDbSha256,
          storageObjects: 0,
          storageFailed: 0,
        };
      }
    } catch (e: unknown) {
      return {
        valid: false,
        reason: `Invalid database manifest JSON: ${(e as Error).message}`,
        dbSizeBytes: dbStat.size,
        dbSha256: computedDbSha256,
        storageObjects: 0,
        storageFailed: 0,
      };
    }
  }

  // Storage verification
  const storageManifestPath = path.join(storageDir, "manifest.json");
  if (!fs.existsSync(storageManifestPath)) {
    return {
      valid: false,
      reason: "Storage manifest.json does not exist",
      dbSizeBytes: dbStat.size,
      dbSha256: computedDbSha256,
      storageObjects: 0,
      storageFailed: 0,
    };
  }

  let storageManifest: StorageBackupManifest;
  try {
    storageManifest = JSON.parse(fs.readFileSync(storageManifestPath, "utf8"));
  } catch (e: unknown) {
    return {
      valid: false,
      reason: `Invalid storage manifest JSON: ${(e as Error).message}`,
      dbSizeBytes: dbStat.size,
      dbSha256: computedDbSha256,
      storageObjects: 0,
      storageFailed: 0,
    };
  }

  if (storageManifest.status !== "success") {
    return {
      valid: false,
      reason: `Storage manifest status is not success (${storageManifest.status}): failed count = ${storageManifest.totalFailed}`,
      dbSizeBytes: dbStat.size,
      dbSha256: computedDbSha256,
      storageObjects: storageManifest.totalDownloaded,
      storageFailed: storageManifest.totalFailed,
    };
  }

  if (storageManifest.totalFailed > 0 || storageManifest.totalDownloaded !== storageManifest.totalDiscovered) {
    return {
      valid: false,
      reason: `Storage backup has incomplete objects: ${storageManifest.totalDownloaded}/${storageManifest.totalDiscovered}, failed=${storageManifest.totalFailed}`,
      dbSizeBytes: dbStat.size,
      dbSha256: computedDbSha256,
      storageObjects: storageManifest.totalDownloaded,
      storageFailed: storageManifest.totalFailed,
    };
  }

  // Verify all downloaded files exist on disk and match sha256
  for (const fileEntry of storageManifest.files) {
    const localFilePath = path.join(storageDir, fileEntry.path);
    if (!fs.existsSync(localFilePath)) {
      return {
        valid: false,
        reason: `Storage file missing on disk: ${fileEntry.path}`,
        dbSizeBytes: dbStat.size,
        dbSha256: computedDbSha256,
        storageObjects: storageManifest.totalDownloaded,
        storageFailed: storageManifest.totalFailed,
      };
    }

    const localSha = calculateSha256(localFilePath);
    if (localSha.toLowerCase() !== fileEntry.sha256.toLowerCase()) {
      return {
        valid: false,
        reason: `Storage file checksum mismatch for ${fileEntry.path}: ${localSha} vs ${fileEntry.sha256}`,
        dbSizeBytes: dbStat.size,
        dbSha256: computedDbSha256,
        storageObjects: storageManifest.totalDownloaded,
        storageFailed: storageManifest.totalFailed,
      };
    }
  }

  return {
    valid: true,
    dbSizeBytes: dbStat.size,
    dbSha256: computedDbSha256,
    storageObjects: storageManifest.totalDownloaded,
    storageFailed: 0,
  };
}

export interface UploadRunResult {
  uploadedCount: number;
  totalBytes: number;
  remoteRunPrefix: string;
}

/**
 * Uploads a verified backup run bundle to offsite S3-compatible storage.
 * Invariant: Refuses overwrite if remote run already exists!
 */
export async function uploadBackupRunToOffsite(
  client: OffsiteStorageClient,
  runDir: string,
  runId: string
): Promise<UploadRunResult> {
  const remotePrefix = formatRemoteRunPrefix(runId);
  const remoteRunManifestKey = `${remotePrefix}/backup-run.json`;

  const existing = await client.verifyObjectExists(remoteRunManifestKey);
  if (existing.exists) {
    throw new Error(`Duplicate runId refuses overwrite: remote object already exists at "${remoteRunManifestKey}"`);
  }

  // Collect all files in runDir recursively
  const filesToUpload: string[] = [];
  function collectFiles(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath);
      } else if (entry.isFile()) {
        filesToUpload.push(fullPath);
      }
    }
  }
  collectFiles(runDir);

  let uploadedCount = 0;
  let totalBytes = 0;

  for (const localPath of filesToUpload) {
    const relativePath = path.relative(runDir, localPath).replace(/\\/g, "/");
    const remoteKey = `${remotePrefix}/${relativePath}`;

    let contentType = "application/octet-stream";
    if (relativePath.endsWith(".json")) contentType = "application/json";
    else if (relativePath.endsWith(".sha256")) contentType = "text/plain";
    else if (relativePath.endsWith(".png")) contentType = "image/png";
    else if (relativePath.endsWith(".jpg") || relativePath.endsWith(".jpeg")) contentType = "image/jpeg";
    else if (relativePath.endsWith(".webp")) contentType = "image/webp";

    const uploadRes = await client.uploadFile(localPath, remoteKey, contentType);
    uploadedCount++;
    totalBytes += uploadRes.sizeBytes;

    // Verify remote presence
    const verifyRes = await client.verifyObjectExists(remoteKey);
    if (!verifyRes.exists) {
      throw new Error(`Remote verification failure: object "${remoteKey}" was not found after upload.`);
    }
  }

  return {
    uploadedCount,
    totalBytes,
    remoteRunPrefix: remotePrefix,
  };
}

export interface BackupOrchestratorOptions {
  runId?: string;
  baseDir?: string;
  dbRunner?: (options: { targetDir: string; throwOnError: boolean; timestamp: string }) => Promise<BackupDbResult>;
  storageRunner?: (options: { targetDir: string; throwOnError: boolean; timestamp: string }) => Promise<BackupStorageResult>;
  offsiteClient?: OffsiteStorageClient;
  now?: Date;
  referenceHealthPath?: string;
  retentionMaxAgeDays?: number;
}

export interface OrchestrationResult {
  runId: string;
  createdAt: string;
  overallStatus: "success" | "failed";
  exitCode: number;
  database: {
    status: "success" | "failed";
    sizeBytes: number;
    sha256: string;
    error?: string;
  };
  storage: {
    status: "success" | "partial" | "failed";
    objects: number;
    failed: number;
    error?: string;
  };
  offsite: {
    status: "success" | "failed" | "skipped";
    uploadedCount: number;
    totalBytes: number;
    error?: string;
  };
  health: BackupHealthState;
  retentionDryRun?: {
    candidatesToDelete: string[];
    protectedRuns: string[];
  };
  error?: string;
}

/**
 * Orchestrates one entire backup run:
 * 1. Creates bundle directory `backups/runs/<timestamp>/`
 * 2. Runs DB and Storage backups
 * 3. Runs local pre-upload verification (Phase 3)
 * 4. Generates `backup-run.json`
 * 5. If verified, uploads to offsite storage and verifies remote presence (Phase 4)
 * 6. Evaluates retention candidates (DRY-RUN only, protecting newest success)
 * 7. Updates `backup-health.json`
 */
export async function executeBackupRun(options: BackupOrchestratorOptions = {}): Promise<OrchestrationResult> {
  const now = options.now || new Date();
  const runId = options.runId || generateBackupTimestamp(now);
  const baseDir = options.baseDir || path.join(process.cwd(), "backups", "runs");
  const runDir = path.join(baseDir, runId);
  const dbDir = path.join(runDir, "db");
  const storageDir = path.join(runDir, "storage");
  const runManifestPath = path.join(runDir, "backup-run.json");
  const healthFilePath = options.referenceHealthPath || path.join(process.cwd(), "backups", "backup-health.json");

  fs.mkdirSync(dbDir, { recursive: true });
  fs.mkdirSync(storageDir, { recursive: true });

  let previousSuccessfulBackupAt: string | undefined = undefined;
  if (fs.existsSync(healthFilePath)) {
    try {
      const prevHealth: BackupHealthState = JSON.parse(fs.readFileSync(healthFilePath, "utf8"));
      previousSuccessfulBackupAt = prevHealth.lastSuccessfulBackupAt;
    } catch {
      // ignore
    }
  }

  // Phase 0 (Ephemeral Runner): If local state does not exist on disk, derive latest success from verified remote R2 backups
  if (!previousSuccessfulBackupAt && options.offsiteClient) {
    try {
      const remoteLatest = await discoverLatestVerifiedRemoteBackup(options.offsiteClient);
      if (remoteLatest) {
        previousSuccessfulBackupAt = remoteLatest.completedAt || remoteLatest.createdAt;
      }
    } catch {
      // gracefully ignore remote discovery error
    }
  }

  let dbResult: BackupDbResult = {
    status: "failed",
    targetDir: dbDir,
    dumpFilePath: "",
    sha256: "",
    sizeBytes: 0,
    manifestPath: "",
  };
  let dbError: string | undefined;

  let storageResult: BackupStorageResult = {
    status: "failed",
    targetDir: storageDir,
    totalDiscovered: 0,
    totalDownloaded: 0,
    totalFailed: 0,
    manifestPath: "",
    files: [],
  };
  let storageError: string | undefined;

  let lastErrorCategory: BackupHealthState["lastErrorCategory"] = "none";

  // 1. Run DB backup
  try {
    if (options.dbRunner) {
      dbResult = await options.dbRunner({ targetDir: dbDir, throwOnError: true, timestamp: runId });
    }
  } catch (err: unknown) {
    dbError = (err as Error).message;
    lastErrorCategory = "db_dump";
  }

  // 2. Run Storage backup
  try {
    if (options.storageRunner) {
      storageResult = await options.storageRunner({ targetDir: storageDir, throwOnError: true, timestamp: runId });
    }
  } catch (err: unknown) {
    storageError = (err as Error).message;
    if (lastErrorCategory === "none") {
      lastErrorCategory = "storage_backup";
    }
  }

  // 3. Pre-upload verification
  const preCheck = validatePreUpload(dbDir, storageDir);
  let overallSuccess =
    dbResult.status === "success" &&
    storageResult.status === "success" &&
    preCheck.valid &&
    !dbError &&
    !storageError;

  if (!overallSuccess && lastErrorCategory === "none") {
    lastErrorCategory = "pre_upload_check";
  }

  // 4. Write backup-run.json
  const runManifest: BackupRunManifest = {
    runId,
    createdAt: now.toISOString(),
    database: {
      status: dbResult.status === "success" && preCheck.valid ? "success" : "failed",
      sizeBytes: preCheck.dbSizeBytes,
      sha256: preCheck.dbSha256,
      ...(dbError ? { error: dbError } : !preCheck.valid && preCheck.reason ? { error: preCheck.reason } : {}),
    },
    storage: {
      status: storageResult.status === "success" && preCheck.valid ? "success" : storageResult.status,
      objects: preCheck.storageObjects,
      failed: preCheck.storageFailed,
      ...(storageError ? { error: storageError } : {}),
    },
    overallStatus: overallSuccess ? "success" : "failed",
    ...(overallSuccess ? {} : { error: preCheck.reason || dbError || storageError || "Verification failed" }),
  };

  fs.writeFileSync(runManifestPath, JSON.stringify(runManifest, null, 2), "utf8");

  // 5. Offsite upload (Phase 4)
  let offsiteStatus: "success" | "failed" | "skipped" = "skipped";
  let uploadInfo = { uploadedCount: 0, totalBytes: 0 };
  let offsiteError: string | undefined;

  if (overallSuccess && options.offsiteClient) {
    try {
      const uploadRes = await uploadBackupRunToOffsite(options.offsiteClient, runDir, runId);
      uploadInfo = { uploadedCount: uploadRes.uploadedCount, totalBytes: uploadRes.totalBytes };
      offsiteStatus = "success";
    } catch (err: unknown) {
      offsiteStatus = "failed";
      overallSuccess = false;
      offsiteError = (err as Error).message;
      lastErrorCategory = "offsite_upload";
      runManifest.overallStatus = "failed";
      runManifest.error = offsiteError;
      fs.writeFileSync(runManifestPath, JSON.stringify(runManifest, null, 2), "utf8");
    }
  }

  // 6. Retention evaluation (DRY-RUN only, Phase 6)
  let retentionResult: { candidatesToDelete: string[]; protectedRuns: string[] } | undefined = undefined;
  if (options.offsiteClient) {
    try {
      const remoteObjects = await options.offsiteClient.listObjects("fuel-station/runs/");
      const runIdSet = new Set<string>();
      for (const obj of remoteObjects) {
        const parts = obj.key.split("/");
        if (parts.length >= 3 && parts[0] === "fuel-station" && parts[1] === "runs") {
          runIdSet.add(parts[2]);
        }
      }

      const retentionCandidates = Array.from(runIdSet).map((id) => {
        const parsed = parseBackupTimestampFromRunId(id);
        return {
          runId: id,
          createdAt: parsed || new Date(0),
          isSuccess: parsed !== null,
        };
      });

      const evaluation = evaluateRetentionCandidates(retentionCandidates, {
        referenceNow: now,
        maxAgeDays: options.retentionMaxAgeDays ?? 30,
      });

      retentionResult = {
        candidatesToDelete: evaluation.candidatesToDelete,
        protectedRuns: evaluation.protectedRuns,
      };
    } catch {
      // ignore retention evaluation failures in run
    }
  }

  // 7. Calculate and write backup-health.json
  const health = calculateBackupHealth({
    currentAttemptAt: now,
    lastAttemptStatus: overallSuccess ? "success" : "failed",
    lastErrorCategory,
    currentRunId: runId,
    previousSuccessfulBackupAt,
    databaseStatus: dbResult.status === "success" && preCheck.valid ? "success" : "failed",
    storageStatus: storageResult.status,
    offsiteStatus,
  });

  const healthDir = path.dirname(healthFilePath);
  if (!fs.existsSync(healthDir)) {
    fs.mkdirSync(healthDir, { recursive: true });
  }
  fs.writeFileSync(healthFilePath, JSON.stringify(health, null, 2), "utf8");

  return {
    runId,
    createdAt: now.toISOString(),
    overallStatus: overallSuccess ? "success" : "failed",
    exitCode: overallSuccess ? 0 : 1,
    database: {
      status: runManifest.database.status,
      sizeBytes: runManifest.database.sizeBytes,
      sha256: runManifest.database.sha256,
      error: dbError || (preCheck.valid ? undefined : preCheck.reason),
    },
    storage: {
      status: runManifest.storage.status,
      objects: runManifest.storage.objects,
      failed: runManifest.storage.failed,
      error: storageError,
    },
    offsite: {
      status: offsiteStatus,
      uploadedCount: uploadInfo.uploadedCount,
      totalBytes: uploadInfo.totalBytes,
      error: offsiteError,
    },
    health,
    retentionDryRun: retentionResult,
    error: overallSuccess ? undefined : runManifest.error,
  };
}
