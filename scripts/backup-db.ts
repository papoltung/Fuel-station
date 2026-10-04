import * as fs from "fs";
import * as path from "path";
import { execFileSync, spawnSync } from "child_process";
import * as dotenv from "dotenv";
import {
  generateBackupTimestamp,
  calculateSha256,
  redactSecretString,
  validateDumpFile,
  createDbManifest,
} from "../lib/backup-helpers";

// Load environment files with fallback order: .env.local -> .env
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

export interface BackupDbOptions {
  directUrl?: string;
  outputBaseDir?: string;
  pgDumpPath?: string;
  pgRestorePath?: string;
  schemas?: string[];
  databaseName?: string;
  throwOnError?: boolean;
  timestamp?: string;
  targetDir?: string;
}

export interface BackupDbResult {
  status: "success" | "failed";
  targetDir: string;
  dumpFilePath: string;
  sha256: string;
  sizeBytes: number;
  manifestPath: string;
  error?: string;
}

function resolvePostgresBinary(binaryName: "pg_dump" | "pg_restore", explicitPath?: string): string {
  if (explicitPath) return explicitPath;
  const envVar = binaryName === "pg_dump" ? process.env.PG_DUMP_PATH : process.env.PG_RESTORE_PATH;
  if (envVar) return envVar;

  // Check if executable exists directly on PATH
  try {
    execFileSync(binaryName, ["--version"], { stdio: ["ignore", "ignore", "ignore"] });
    return binaryName;
  } catch {
    // Check standard Windows user and system locations
    const candidatePaths = [
      path.join(process.env.LOCALAPPDATA || "", "Programs", "PostgreSQL", "17", "pgsql", "bin", `${binaryName}.exe`),
      path.join("C:", "Program Files", "PostgreSQL", "17", "bin", `${binaryName}.exe`),
      path.join("C:", "Program Files", "PostgreSQL", "17", "pgsql", "bin", `${binaryName}.exe`),
    ];
    for (const cand of candidatePaths) {
      if (fs.existsSync(cand)) return cand;
    }
    return binaryName;
  }
}

export function runDatabaseBackup(options: BackupDbOptions = {}): BackupDbResult {
  const startTime = Date.now();
  const directUrl = options.directUrl ?? process.env.DIRECT_URL;

  const fail = (errMsg: string, code: number = 1): never => {
    if (options.throwOnError) {
      throw new Error(errMsg);
    }
    process.exit(code);
  };

  if (!directUrl) {
    const msg = "[backup-db] ERROR: DIRECT_URL environment variable is missing.";
    console.error(msg);
    console.error("[backup-db] Please configure DIRECT_URL in .env or .env.local before running backup.");
    fail(msg, 1);
  }

  // Detect or verify pg_dump executable
  const pgDumpBin = resolvePostgresBinary("pg_dump", options.pgDumpPath);
  const pgRestoreBin = resolvePostgresBinary("pg_restore", options.pgRestorePath);

  let pgDumpVersion = "unknown";
  try {
    const versionOutput = execFileSync(pgDumpBin, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    pgDumpVersion = versionOutput.trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[backup-db] ERROR: pg_dump executable was not found or failed to execute.");
    console.error(`[backup-db] Attempted binary: "${pgDumpBin}"`);
    console.error(`[backup-db] Details: ${redactSecretString(msg)}`);
    console.error(
      "[backup-db] Recommendation: Install PostgreSQL 17 client tools (winget install PostgreSQL.PostgreSQL.17 or set PG_DUMP_PATH)."
    );
    fail(`pg_dump not found: ${msg}`, 1);
  }

  const timestamp = options.timestamp ?? generateBackupTimestamp();
  const baseDir = options.outputBaseDir ?? path.join(process.cwd(), "backups", "db");
  const targetDir = options.targetDir ?? path.join(baseDir, timestamp);

  if (fs.existsSync(targetDir) && !options.targetDir) {
    const msg = `[backup-db] ERROR: Target backup directory already exists: ${targetDir}. Refusing to overwrite.`;
    console.error(msg);
    fail(msg, 1);
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const dumpFilename = "fuel-station.dump";
  const dumpFilePath = path.join(targetDir, dumpFilename);
  const sha256FilePath = path.join(targetDir, `${dumpFilename}.sha256`);
  const manifestFilePath = path.join(targetDir, "manifest.json");

  const schemas = options.schemas ?? ["public"];
  const databaseName = options.databaseName ?? "fuel-station";

  console.log(`[backup-db] Starting PostgreSQL logical backup at ${timestamp}`);
  console.log(`[backup-db] Target directory: ${targetDir}`);
  console.log(`[backup-db] pg_dump version: ${pgDumpVersion}`);
  console.log(`[backup-db] Target schemas: ${schemas.join(", ")}`);
  console.log(`[backup-db] Dump format: postgres-custom (-Fc)`);

  const pgDumpArgs = [
    `--dbname=${directUrl}`,
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    ...schemas.map((s) => `--schema=${s}`),
    `--file=${dumpFilePath}`,
  ];

  const dumpResult = spawnSync(pgDumpBin, pgDumpArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const durationMs = Date.now() - startTime;

  if (dumpResult.status !== 0) {
    const stderrRedacted = redactSecretString(dumpResult.stderr || "Unknown pg_dump error");
    console.error(`[backup-db] pg_dump failed with exit code ${dumpResult.status}:`);
    console.error(stderrRedacted);

    // Clean up partial/failed file if exists
    if (fs.existsSync(dumpFilePath)) {
      try {
        fs.unlinkSync(dumpFilePath);
      } catch {
        // ignore
      }
    }

    const failedManifest = createDbManifest({
      createdAt: timestamp,
      database: databaseName,
      schemas,
      sizeBytes: 0,
      sha256: "",
      pgDumpVersion,
      durationMs,
      status: "failed",
      error: stderrRedacted,
    });
    fs.writeFileSync(manifestFilePath, JSON.stringify(failedManifest, null, 2), "utf8");
    fail(`pg_dump failed with exit code ${dumpResult.status}: ${stderrRedacted}`, dumpResult.status ?? 1);
  }

  // Validate the resulting dump file (Phase 3: file exists and > 0 bytes)
  const validation = validateDumpFile(dumpFilePath, 100);
  if (!validation.valid) {
    console.error(`[backup-db] ERROR: Dump file validation failed: ${validation.reason}`);
    const failedManifest = createDbManifest({
      createdAt: timestamp,
      database: databaseName,
      schemas,
      sizeBytes: validation.sizeBytes,
      sha256: "",
      pgDumpVersion,
      durationMs,
      status: "failed",
      error: validation.reason,
    });
    fs.writeFileSync(manifestFilePath, JSON.stringify(failedManifest, null, 2), "utf8");
    fail(`Dump file validation failed: ${validation.reason}`, 1);
  }

  // Compute SHA-256
  const sha256 = calculateSha256(dumpFilePath);
  fs.writeFileSync(sha256FilePath, `${sha256}  ${dumpFilename}\n`, "utf8");

  // Validate archive integrity using pg_restore --list (Phase 3)
  console.log(`[backup-db] Verifying archive readability with pg_restore --list...`);
  const restoreListResult = spawnSync(pgRestoreBin, ["--list", dumpFilePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (restoreListResult.status !== 0) {
    const restoreErrRedacted = redactSecretString(restoreListResult.stderr || "pg_restore --list check failed");
    console.error(`[backup-db] ERROR: Archive is unreadable or corrupted according to pg_restore:`);
    console.error(restoreErrRedacted);

    const failedManifest = createDbManifest({
      createdAt: timestamp,
      database: databaseName,
      schemas,
      sizeBytes: validation.sizeBytes,
      sha256,
      pgDumpVersion,
      durationMs,
      status: "failed",
      error: `pg_restore --list verification failed: ${restoreErrRedacted}`,
    });
    fs.writeFileSync(manifestFilePath, JSON.stringify(failedManifest, null, 2), "utf8");
    fail(`Archive is unreadable according to pg_restore: ${restoreErrRedacted}`, 1);
  }

  // Create success manifest
  const manifest = createDbManifest({
    createdAt: timestamp,
    database: databaseName,
    schemas,
    sizeBytes: validation.sizeBytes,
    sha256,
    pgDumpVersion,
    durationMs,
    status: "success",
  });

  fs.writeFileSync(manifestFilePath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`[backup-db] SUCCESS: Backup completed in ${durationMs}ms`);
  console.log(`[backup-db] Archive size: ${(validation.sizeBytes / 1024).toFixed(2)} KB`);
  console.log(`[backup-db] SHA-256: ${sha256}`);
  console.log(`[backup-db] Manifest written: ${manifestFilePath}`);

  return {
    status: "success",
    targetDir,
    dumpFilePath,
    sha256,
    sizeBytes: validation.sizeBytes,
    manifestPath: manifestFilePath,
  };
}

// Execute when invoked directly from CLI
if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.endsWith("backup-db.ts"))) {
  runDatabaseBackup();
}
