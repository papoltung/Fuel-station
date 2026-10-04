import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs";

export interface DbBackupManifest {
  createdAt: string;
  format: "postgres-custom";
  database: string;
  schemas: string[];
  sizeBytes: number;
  sha256: string;
  pgDumpVersion: string;
  durationMs: number;
  status: "success" | "failed";
  error?: string;
}

export interface StorageFileEntry {
  name: string;
  path: string;
  sizeBytes: number;
  contentType: string;
  sha256: string;
  downloadedAt: string;
}

export interface StorageBackupManifest {
  createdAt: string;
  bucket: string;
  status: "success" | "partial" | "failed";
  totalDiscovered: number;
  totalDownloaded: number;
  totalFailed: number;
  durationMs: number;
  files: StorageFileEntry[];
  failedPaths: string[];
  error?: string;
}

/**
 * Generates an ISO-like UTC timestamp string safe for file and directory names.
 * Format: YYYY-MM-DDTHHMMSSZ (colons removed for Windows filesystem compatibility)
 */
export function generateBackupTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}${min}${ss}Z`;
}

/**
 * Calculates SHA-256 hash of a Buffer or file path.
 */
export function calculateSha256(input: Buffer | string): string {
  if (typeof input === "string") {
    const fileBuffer = fs.readFileSync(input);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  }
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Redacts passwords and credentials from PostgreSQL or HTTP connection strings and logs.
 */
export function redactSecretString(input: string): string {
  if (!input) return "";

  // Redact postgres:// or postgresql:// URLs
  let redacted = input.replace(
    /(postgres(?:ql)?:\/\/)([^:@\s]+)(?::([^@\s]+))?(@[^\s/?#]+)/gi,
    (_match, prefix, user, pass, host) => {
      const maskedPass = pass ? ":***" : "";
      return `${prefix}${user}${maskedPass}${host}`;
    }
  );

  // Redact service role keys or JWT tokens: eyJ...
  redacted = redacted.replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, "[REDACTED_JWT]");

  // Redact sb_publishable or sb_secret style keys
  redacted = redacted.replace(/sb_(?:publishable|secret)_[a-zA-Z0-9_-]+/g, "[REDACTED_SUPABASE_KEY]");

  return redacted;
}

/**
 * Sanitizes and safely resolves a relative storage path within a root directory.
 * Prevents directory traversal attacks (e.g. ../../etc/passwd).
 */
export function sanitizeStoragePath(baseDir: string, relativePath: string): string {
  // Normalize and replace any leading slashes or Windows backslashes
  const cleanRelative = relativePath
    .replace(/^[\/\\]+/, "")
    .replace(/\\/g, "/");

  // Prevent path traversal
  const normalizedParts = cleanRelative.split("/").filter((part) => part && part !== ".");
  for (const part of normalizedParts) {
    if (part === "..") {
      throw new Error(`Path traversal attempt detected in path: ${relativePath}`);
    }
    // Prevent invalid Windows characters in filename
    if (/[<>:"|?*]/.test(part)) {
      throw new Error(`Invalid characters in filename or path component: ${part}`);
    }
  }

  const resolved = path.resolve(baseDir, normalizedParts.join(path.sep));
  const resolvedBase = path.resolve(baseDir);

  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`Resolved path escapes base directory: ${relativePath}`);
  }

  return resolved;
}

/**
 * Determines storage backup completion status based on object counters.
 */
export function calculateStorageStatus(
  discovered: number,
  downloaded: number,
  failed: number
): "success" | "partial" | "failed" {
  if (discovered === 0) {
    return "success";
  }
  if (failed === 0 && downloaded === discovered) {
    return "success";
  }
  if (downloaded > 0 && failed > 0) {
    return "partial";
  }
  return "failed";
}

/**
 * Validates a dump file's existence and minimum size.
 */
export function validateDumpFile(
  filePath: string,
  minBytes: number = 1
): { valid: boolean; sizeBytes: number; reason?: string } {
  if (!fs.existsSync(filePath)) {
    return { valid: false, sizeBytes: 0, reason: "Dump file does not exist" };
  }
  const stat = fs.statSync(filePath);
  if (stat.size < minBytes) {
    return { valid: false, sizeBytes: stat.size, reason: `Dump file is empty or too small (${stat.size} bytes)` };
  }
  return { valid: true, sizeBytes: stat.size };
}

/**
 * Creates DB backup manifest JSON ensuring no secrets are present.
 */
export function createDbManifest(params: Omit<DbBackupManifest, "format">): DbBackupManifest {
  const manifest: DbBackupManifest = {
    createdAt: params.createdAt,
    format: "postgres-custom",
    database: params.database,
    schemas: params.schemas,
    sizeBytes: params.sizeBytes,
    sha256: params.sha256,
    pgDumpVersion: redactSecretString(params.pgDumpVersion),
    durationMs: params.durationMs,
    status: params.status,
  };

  if (params.error) {
    manifest.error = redactSecretString(params.error);
  }

  return manifest;
}

/**
 * Creates Storage backup manifest JSON ensuring no secrets are present.
 */
export function createStorageManifest(params: StorageBackupManifest): StorageBackupManifest {
  return {
    createdAt: params.createdAt,
    bucket: params.bucket,
    status: params.status,
    totalDiscovered: params.totalDiscovered,
    totalDownloaded: params.totalDownloaded,
    totalFailed: params.totalFailed,
    durationMs: params.durationMs,
    files: params.files.map((f) => ({
      name: f.name,
      path: f.path,
      sizeBytes: f.sizeBytes,
      contentType: f.contentType,
      sha256: f.sha256,
      downloadedAt: f.downloadedAt,
    })),
    failedPaths: params.failedPaths.map((p) => p),
    ...(params.error ? { error: redactSecretString(params.error) } : {}),
  };
}
