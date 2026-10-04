import * as fs from "fs";
import { calculateSha256, redactSecretString } from "./backup-helpers";

export interface RestoreSafetyParams {
  restoreUrl?: string;
  allowDisposable?: string | boolean;
  directUrl?: string;
  databaseUrl?: string;
  knownProdRef?: string;
}

export interface RestoreSafetyResult {
  safe: boolean;
  reason?: string;
}

export interface DumpIntegrityResult {
  valid: boolean;
  reason?: string;
  sha256?: string;
}

const DEFAULT_KNOWN_PROD_REF = "doglpjixsyuhtabaxmib";
const FORBIDDEN_HOST_PATTERNS = ["supabase.co", "pooler.supabase.com"];
const ALLOWED_LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Validates that a target database URL for restore drill is strictly disposable
 * and absolutely cannot point to or match the production database.
 *
 * Implements a strict positive allowlist: target MUST be local loopback (localhost, 127.0.0.1, ::1).
 * All arbitrary remote hosts, cloud databases (RDS, Neon, Supabase), and production hosts are rejected.
 */
export function validateRestoreTarget(params: RestoreSafetyParams): RestoreSafetyResult {
  const { restoreUrl, allowDisposable, directUrl, databaseUrl, knownProdRef = DEFAULT_KNOWN_PROD_REF } = params;

  if (!restoreUrl || !restoreUrl.trim()) {
    return {
      safe: false,
      reason: "RESTORE_DRILL_DATABASE_URL is missing. Refusing to restore (FAIL CLOSED).",
    };
  }

  const isOptIn = allowDisposable === true || allowDisposable === "true";
  if (!isOptIn) {
    return {
      safe: false,
      reason: "ALLOW_DISPOSABLE_RESTORE=true is required to execute restore drill.",
    };
  }

  // Reject exact match against production DIRECT_URL or DATABASE_URL
  if (directUrl && restoreUrl.trim() === directUrl.trim()) {
    return {
      safe: false,
      reason: "Target URL strictly matches production DIRECT_URL. Restore refused.",
    };
  }

  if (databaseUrl && restoreUrl.trim() === databaseUrl.trim()) {
    return {
      safe: false,
      reason: "Target URL strictly matches production DATABASE_URL. Restore refused.",
    };
  }

  // Reject URL containing production project ref
  if (knownProdRef && restoreUrl.toLowerCase().includes(knownProdRef.toLowerCase())) {
    return {
      safe: false,
      reason: `Target URL contains production Supabase project reference (${knownProdRef}). Restore refused.`,
    };
  }

  // Reject URL containing production Supabase cloud hosts
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (restoreUrl.toLowerCase().includes(pattern.toLowerCase())) {
      return {
        safe: false,
        reason: `Target URL points to Supabase managed host (${pattern}). Restore refused.`,
      };
    }
  }

  // STRICT POSITIVE ALLOWLIST: Must resolve to local loopback
  try {
    const parsed = new URL(restoreUrl);
    const rawHostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    if (!ALLOWED_LOCAL_HOSTNAMES.has(rawHostname)) {
      return {
        safe: false,
        reason: `Target host "${rawHostname}" is rejected. Restore target MUST be local loopback only (allowed: localhost, 127.0.0.1, ::1). Remote restore refused.`,
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      safe: false,
      reason: `Invalid RESTORE_DRILL_DATABASE_URL: ${redactSecretString(msg)}. Restore refused.`,
    };
  }

  return { safe: true };
}

/**
 * Verifies the integrity of a backup dump before attempting any restore.
 */
export function verifyDumpIntegrity(
  dumpPath: string,
  expectedSha256?: string,
  manifestStatus?: string
): DumpIntegrityResult {
  if (!fs.existsSync(dumpPath)) {
    return { valid: false, reason: `Backup dump file not found at: ${dumpPath}` };
  }

  const stat = fs.statSync(dumpPath);
  if (stat.size === 0) {
    return { valid: false, reason: "Backup dump file is 0 bytes (empty)." };
  }

  if (manifestStatus && manifestStatus !== "success") {
    return {
      valid: false,
      reason: `Backup manifest indicates non-success status: "${manifestStatus}". Refusing to restore.`,
    };
  }

  const actualSha256 = calculateSha256(dumpPath);

  if (expectedSha256 && actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    return {
      valid: false,
      reason: `SHA-256 mismatch! Expected ${expectedSha256} but got ${actualSha256}. Refusing to restore corrupted or altered dump.`,
      sha256: actualSha256,
    };
  }

  return { valid: true, sha256: actualSha256 };
}

/**
 * Compares row counts between source production baseline and restored target.
 */
export function compareRowCounts(
  productionCounts: Record<string, number>,
  restoredCounts: Record<string, number>
): {
  match: boolean;
  details: Record<string, { prod: number; restored: number; match: boolean }>;
} {
  let allMatch = true;
  const details: Record<string, { prod: number; restored: number; match: boolean }> = {};

  for (const table of Object.keys(productionCounts)) {
    const prod = productionCounts[table] ?? 0;
    const restored = restoredCounts[table] ?? 0;
    const match = prod === restored;
    if (!match) allMatch = false;

    details[table] = { prod, restored, match };
  }

  return { match: allMatch, details };
}
