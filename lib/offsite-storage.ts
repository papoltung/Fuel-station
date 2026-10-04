import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Readable } from "stream";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { calculateSha256, redactSecretString } from "./backup-helpers";

export interface S3StorageConfig {
  endpoint?: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface RemoteObjectMetadata {
  key: string;
  sizeBytes: number;
  etag?: string;
  lastModified?: Date;
}

export interface OffsiteStorageClient {
  uploadFile(
    localPath: string,
    remoteKey: string,
    contentType?: string
  ): Promise<{ key: string; sizeBytes: number; etag?: string }>;
  verifyObjectExists(remoteKey: string): Promise<{ exists: boolean; sizeBytes?: number; etag?: string }>;
  downloadFile(remoteKey: string, destPath: string): Promise<{ localPath: string; sizeBytes: number }>;
  listObjects(prefix?: string): Promise<RemoteObjectMetadata[]>;
  deleteObject?(remoteKey: string): Promise<void>;
}

/**
 * Concrete S3-compatible Offsite Storage Client (e.g. Cloudflare R2 Standard)
 */
export class S3OffsiteStorageClient implements OffsiteStorageClient {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || "auto",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Cloudflare R2 and generic S3-compatible providers require path-style or standard virtual-host style
      forcePathStyle: true,
    });
  }

  async uploadFile(
    localPath: string,
    remoteKey: string,
    contentType: string = "application/octet-stream"
  ): Promise<{ key: string; sizeBytes: number; etag?: string }> {
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local file not found for upload: ${localPath}`);
    }

    const fileBuffer = fs.readFileSync(localPath);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: remoteKey,
      Body: fileBuffer,
      ContentType: contentType,
    });

    const response = await this.client.send(command);
    return {
      key: remoteKey,
      sizeBytes: fileBuffer.length,
      etag: response.ETag?.replace(/"/g, ""),
    };
  }

  async verifyObjectExists(
    remoteKey: string
  ): Promise<{ exists: boolean; sizeBytes?: number; etag?: string }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: remoteKey,
      });
      const response = await this.client.send(command);
      return {
        exists: true,
        sizeBytes: response.ContentLength,
        etag: response.ETag?.replace(/"/g, ""),
      };
    } catch (err: unknown) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      const name = (err as Error)?.name;
      if (status === 404 || name === "NotFound" || name === "NoSuchKey") {
        return { exists: false };
      }
      throw err;
    }
  }

  async downloadFile(remoteKey: string, destPath: string): Promise<{ localPath: string; sizeBytes: number }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: remoteKey,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`Empty response body from remote key: ${remoteKey}`);
    }

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Stream or buffer to local file
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fullBuffer = Buffer.concat(chunks);
    fs.writeFileSync(destPath, fullBuffer);

    return {
      localPath: destPath,
      sizeBytes: fullBuffer.length,
    };
  }

  async listObjects(prefix?: string): Promise<RemoteObjectMetadata[]> {
    const results: RemoteObjectMetadata[] = [];
    let continuationToken: string | undefined = undefined;

    do {
      const command: ListObjectsV2Command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await this.client.send(command);
      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key) {
            results.push({
              key: item.Key,
              sizeBytes: item.Size ?? 0,
              etag: item.ETag?.replace(/"/g, ""),
              lastModified: item.LastModified,
            });
          }
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return results;
  }

  async deleteObject(remoteKey: string): Promise<void> {
    // Note: Kept optional and strictly tested; destructive deletions are not invoked in dry-run
    throw new Error(`Direct remote deletion is disabled in this phase. Key: ${remoteKey}`);
  }
}

/**
 * In-memory Mock Offsite Storage Client for deterministic unit testing
 */
export class MockOffsiteStorageClient implements OffsiteStorageClient {
  public store = new Map<string, { buffer: Buffer; contentType: string; lastModified: Date }>();
  public failNextUpload = false;
  public failNextVerify = false;
  public failNextDownload = false;

  async uploadFile(
    localPath: string,
    remoteKey: string,
    contentType: string = "application/octet-stream"
  ): Promise<{ key: string; sizeBytes: number; etag?: string }> {
    if (this.failNextUpload) {
      this.failNextUpload = false;
      throw new Error(`Mock upload failed intentionally for key ${remoteKey}`);
    }
    const buf = fs.readFileSync(localPath);
    this.store.set(remoteKey, { buffer: buf, contentType, lastModified: new Date() });
    return {
      key: remoteKey,
      sizeBytes: buf.length,
      etag: calculateSha256(buf),
    };
  }

  async verifyObjectExists(
    remoteKey: string
  ): Promise<{ exists: boolean; sizeBytes?: number; etag?: string }> {
    if (this.failNextVerify) {
      this.failNextVerify = false;
      throw new Error(`Mock verify failed intentionally for key ${remoteKey}`);
    }
    const item = this.store.get(remoteKey);
    if (!item) {
      return { exists: false };
    }
    return {
      exists: true,
      sizeBytes: item.buffer.length,
      etag: calculateSha256(item.buffer),
    };
  }

  async downloadFile(remoteKey: string, destPath: string): Promise<{ localPath: string; sizeBytes: number }> {
    if (this.failNextDownload) {
      this.failNextDownload = false;
      throw new Error(`Mock download failed intentionally for key ${remoteKey}`);
    }
    const item = this.store.get(remoteKey);
    if (!item) {
      throw new Error(`Object not found in mock store: ${remoteKey}`);
    }
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.writeFileSync(destPath, item.buffer);
    return {
      localPath: destPath,
      sizeBytes: item.buffer.length,
    };
  }

  async listObjects(prefix?: string): Promise<RemoteObjectMetadata[]> {
    const list: RemoteObjectMetadata[] = [];
    for (const [key, val] of this.store.entries()) {
      if (!prefix || key.startsWith(prefix)) {
        list.push({
          key,
          sizeBytes: val.buffer.length,
          etag: calculateSha256(val.buffer),
          lastModified: val.lastModified,
        });
      }
    }
    return list;
  }

  async deleteObject(remoteKey: string): Promise<void> {
    this.store.delete(remoteKey);
  }
}

/**
 * Format remote key structure:
 * fuel-station/runs/<runId>/...
 */
export function formatRemoteRunPrefix(runId: string): string {
  return `fuel-station/runs/${runId}`;
}

/**
 * Parses UTC ISO-like timestamp from runId (e.g. "2026-10-04T180000Z")
 * Returns null if format does not strictly match.
 */
export function parseBackupTimestampFromRunId(runId: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(runId);
  if (!match) return null;

  const [, yStr, mStr, dStr, hStr, minStr, sStr] = match;
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1;
  const d = parseInt(dStr, 10);
  const h = parseInt(hStr, 10);
  const min = parseInt(minStr, 10);
  const s = parseInt(sStr, 10);

  if (m < 0 || m > 11 || d < 1 || d > 31 || h < 0 || h > 23 || min < 0 || min > 59 || s < 0 || s > 59) {
    return null;
  }

  const date = new Date(Date.UTC(y, m, d, h, min, s));
  if (
    isNaN(date.getTime()) ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m ||
    date.getUTCDate() !== d ||
    date.getUTCHours() !== h ||
    date.getUTCMinutes() !== min ||
    date.getUTCSeconds() !== s
  ) {
    return null;
  }

  return date;
}

export interface RetentionRunCandidate {
  runId: string;
  createdAt: Date;
  isSuccess: boolean;
}

export interface RetentionEvaluationResult {
  candidatesToDelete: string[];
  protectedRuns: string[];
  reasons: Record<string, string>;
}

/**
 * Evaluates retention candidates strictly preserving the newest successful backup.
 * Invariants:
 * 1. Malformed run IDs are ignored (never deleted).
 * 2. Newest successful backup is NEVER deleted, regardless of age.
 * 3. Dry-run evaluates without deleting.
 * 4. Only successful runs older than maxAgeDays become deletion candidates.
 */
export function evaluateRetentionCandidates(
  runs: RetentionRunCandidate[],
  options: {
    referenceNow?: Date;
    maxAgeDays?: number;
  } = {}
): RetentionEvaluationResult {
  const now = options.referenceNow || new Date();
  const maxAgeDays = options.maxAgeDays ?? 30;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const candidatesToDelete: string[] = [];
  const protectedRuns: string[] = [];
  const reasons: Record<string, string> = {};

  // Sort runs by createdAt descending (newest first)
  const sorted = [...runs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Find the newest successful run
  const newestSuccess = sorted.find((r) => r.isSuccess);

  for (const r of sorted) {
    if (newestSuccess && r.runId === newestSuccess.runId) {
      protectedRuns.push(r.runId);
      reasons[r.runId] = "PROTECTED: Newest successful backup run (must never be deleted)";
      continue;
    }

    const ageMs = now.getTime() - r.createdAt.getTime();
    if (ageMs > maxAgeMs) {
      candidatesToDelete.push(r.runId);
      reasons[r.runId] = `CANDIDATE: Age (${(ageMs / (1000 * 60 * 60 * 24)).toFixed(1)} days) exceeds ${maxAgeDays} days limit`;
    } else {
      protectedRuns.push(r.runId);
      reasons[r.runId] = `PROTECTED: Within retention period of ${maxAgeDays} days`;
    }
  }

  return { candidatesToDelete, protectedRuns, reasons };
}

export interface RemoteRunInfo {
  runId: string;
  createdAt: string;
  verifiedAt?: string;
  completedAt?: string;
  status: "verified" | "success" | "failed";
}

/**
 * Discovers the latest verified successful backup run directly from remote offsite storage.
 * Designed for ephemeral runners (e.g. GitHub Actions) that do not retain local state.
 *
 * Invariant (Sprint 4C.2 Commit Marker Pattern):
 * Only runs that contain the final commit marker "_VERIFIED.json" (written ONLY after
 * deep remote round-trip verification passes) are accepted as verified.
 * Any run without "_VERIFIED.json" is treated as incomplete/unverified/failed!
 */
export async function discoverLatestVerifiedRemoteBackup(
  client: OffsiteStorageClient,
  runsPrefix: string = "fuel-station/runs/"
): Promise<RemoteRunInfo | null> {
  const objects = await client.listObjects(runsPrefix);
  const verifiedMarkerSuffix = "/_VERIFIED.json";

  const verifiedKeys = objects
    .map((o) => o.key)
    .filter((k) => k.startsWith(runsPrefix) && k.endsWith(verifiedMarkerSuffix));

  if (verifiedKeys.length === 0) {
    return null;
  }

  const candidates: { runId: string; markerKey: string; timestamp: Date }[] = [];
  for (const k of verifiedKeys) {
    const parts = k.slice(runsPrefix.length).split("/");
    const runId = parts[0];
    const ts = parseBackupTimestampFromRunId(runId);
    if (ts) {
      candidates.push({ runId, markerKey: k, timestamp: ts });
    }
  }

  candidates.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  for (const c of candidates) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "r2-verify-marker-"));
    const tempFile = path.join(tempDir, "_VERIFIED.json");
    try {
      await client.downloadFile(c.markerKey, tempFile);
      const marker = JSON.parse(fs.readFileSync(tempFile, "utf8"));
      if (marker.status === "verified" || marker.verifiedAt) {
        return {
          runId: c.runId,
          createdAt: marker.createdAt || c.timestamp.toISOString(),
          verifiedAt: marker.verifiedAt || c.timestamp.toISOString(),
          completedAt: marker.verifiedAt || marker.completedAt || c.timestamp.toISOString(),
          status: "verified",
        };
      }
    } catch {
      // Continue to next candidate
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  return null;
}

export type HealthStatusType = "HEALTHY" | "DEGRADED" | "FAILED";

export interface BackupHealthState {
  lastAttemptAt: string;
  lastSuccessfulBackupAt?: string;
  lastRunId?: string;
  lastStatus: "success" | "failed";
  lastErrorCategory:
    | "none"
    | "db_dump"
    | "db_verify"
    | "storage_backup"
    | "storage_verify"
    | "pre_upload_check"
    | "offsite_upload"
    | "remote_verify"
    | "unknown";
  databaseStatus: "success" | "failed" | "not_run";
  storageStatus: "success" | "partial" | "failed" | "not_run";
  offsiteStatus: "success" | "failed" | "skipped";
  healthState: HealthStatusType;
  healthReason: string;
}

/**
 * Calculates machine-readable backup health state.
 *
 * Rules (Sprint 4C.2):
 * - Backup cadence = 4h
 * - Target RPO = 6h (Operational margin = ~2h)
 * - HEALTHY: lastStatus == "success" AND age <= targetWindowHours (<= 6h)
 * - DEGRADED:
 *     - Local verification PASS but off-site skipped (diagnostic mode)
 *     - OR: Succeeded but elapsed time > 6h (Target RPO missed)
 *     - OR: Latest attempt failed, but previous successful backup is still within grace window
 * - FAILED: Latest run failed AND latest successful backup is missing or expired (> 8h alert threshold)
 * - Invariant: A failed run does NOT erase lastSuccessfulBackupAt!
 */
export function calculateBackupHealth(params: {
  currentAttemptAt: Date;
  lastAttemptStatus: "success" | "failed";
  lastErrorCategory?: BackupHealthState["lastErrorCategory"];
  currentRunId?: string;
  previousSuccessfulBackupAt?: string;
  databaseStatus: "success" | "failed" | "not_run";
  storageStatus: "success" | "partial" | "failed" | "not_run";
  offsiteStatus: "success" | "failed" | "skipped";
  targetWindowHours?: number;
  graceWindowHours?: number;
}): BackupHealthState {
  const targetWindowHours = params.targetWindowHours ?? 6;
  const graceWindowHours = params.graceWindowHours ?? 2;
  const maxAllowedAgeMs = (targetWindowHours + graceWindowHours) * 60 * 60 * 1000;

  const currentIso = params.currentAttemptAt.toISOString();

  // Operational invariant: Only a backup that is verified off-site counts as operationally successful
  const isOperationallySuccessful = params.lastAttemptStatus === "success" && params.offsiteStatus === "success";

  let effectiveLastSuccess = params.previousSuccessfulBackupAt;
  if (isOperationallySuccessful) {
    effectiveLastSuccess = currentIso;
  }

  let healthState: HealthStatusType = "FAILED";
  let healthReason = "";

  if (params.offsiteStatus === "skipped") {
    // Deliberate local diagnostic run: Local PASS -> DEGRADED; Local FAIL -> FAILED
    if (params.lastAttemptStatus === "success") {
      healthState = "DEGRADED";
      healthReason = "Local verification PASS, but off-site upload was skipped (diagnostic mode, not operationally healthy)";
    } else {
      healthState = "FAILED";
      healthReason = `Local verification FAIL (${params.lastErrorCategory || "error"}) with off-site upload skipped`;
    }
  } else if (!effectiveLastSuccess) {
    healthState = "FAILED";
    healthReason = "No verified successful backup has ever been recorded";
  } else {
    const successDate = new Date(effectiveLastSuccess);
    const ageMs = params.currentAttemptAt.getTime() - successDate.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    const targetWindowMs = targetWindowHours * 60 * 60 * 1000;

    if (params.lastAttemptStatus === "success") {
      if (ageMs <= targetWindowMs) {
        healthState = "HEALTHY";
        healthReason = `Latest successful backup is fresh (${ageHours.toFixed(1)}h ago <= ${targetWindowHours}h target RPO)`;
      } else {
        healthState = "DEGRADED";
        healthReason = `Backup succeeded but elapsed time (${ageHours.toFixed(1)}h ago) missed ${targetWindowHours}h target RPO`;
      }
    } else {
      // Last attempt failed
      if (ageMs <= targetWindowMs) {
        healthState = "DEGRADED";
        healthReason = `Latest attempt failed (${params.lastErrorCategory || "error"}), but previous backup (${ageHours.toFixed(1)}h ago) is within ${targetWindowHours}h target RPO`;
      } else if (ageMs <= maxAllowedAgeMs) {
        healthState = "DEGRADED";
        healthReason = `Latest attempt failed (${params.lastErrorCategory || "error"}), and previous backup (${ageHours.toFixed(1)}h ago) missed ${targetWindowHours}h target RPO (within ${graceWindowHours}h operational grace)`;
      } else {
        healthState = "FAILED";
        healthReason = `Latest run failed and latest successful backup is expired (${ageHours.toFixed(1)}h ago > ${targetWindowHours + graceWindowHours}h alert threshold)`;
      }
    }
  }

  return {
    lastAttemptAt: currentIso,
    lastSuccessfulBackupAt: effectiveLastSuccess,
    lastRunId: params.currentRunId,
    lastStatus: params.lastAttemptStatus,
    lastErrorCategory: params.lastErrorCategory ?? "none",
    databaseStatus: params.databaseStatus,
    storageStatus: params.storageStatus,
    offsiteStatus: params.offsiteStatus,
    healthState,
    healthReason,
  };
}
