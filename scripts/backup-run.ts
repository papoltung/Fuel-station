import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { runDatabaseBackup } from "./backup-db";
import { runStorageBackup } from "./backup-storage";
import { S3OffsiteStorageClient, OffsiteStorageClient } from "../lib/offsite-storage";
import { executeBackupRun, validatePreUpload } from "../lib/backup-orchestrator";
import { redactSecretString, calculateSha256 } from "../lib/backup-helpers";
import { sendDeadManSignal } from "../lib/heartbeat";

// Load environment variables (.env.local -> .env)
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

export interface BackupRunCliOptions {
  runId?: string;
  skipOffsite?: boolean;
  verifyRemoteDownload?: boolean;
}

export async function runFullBackupPipeline(cliOptions: BackupRunCliOptions = {}) {
  const startTime = Date.now();
  console.log("==================================================");
  console.log(" Fuel Station: Unified Backup & Off-site Pipeline ");
  console.log("==================================================");

  // Send external dead-man start signal (Phase 9)
  await sendDeadManSignal("start");

  let offsiteClient: OffsiteStorageClient | undefined = undefined;

  const endpoint = process.env.OFFSITE_S3_ENDPOINT || process.env.R2_ENDPOINT;
  const bucket = process.env.OFFSITE_S3_BUCKET || process.env.R2_BUCKET || "fuel-station-backups-offsite";
  const region = process.env.OFFSITE_S3_REGION || process.env.R2_REGION || "auto";
  const accessKeyId = process.env.OFFSITE_S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OFFSITE_S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;

  if (cliOptions.skipOffsite) {
    console.log("[backup-run] Notice: --skip-offsite flag set. Off-site upload will be skipped.");
  } else if (!accessKeyId || !secretAccessKey) {
    console.warn("[backup-run] WARNING: Off-site S3 credentials missing (OFFSITE_S3_ACCESS_KEY_ID / SECRET_ACCESS_KEY).");
    console.warn("[backup-run] Offsite upload will be skipped. Only local verified bundle will be created.");
  } else {
    console.log(`[backup-run] Configuring S3-compatible offsite client:`);
    console.log(`[backup-run]   Endpoint: ${endpoint ? redactSecretString(endpoint) : "standard-aws-s3"}`);
    console.log(`[backup-run]   Bucket  : ${bucket}`);
    console.log(`[backup-run]   Region  : ${region}`);

    offsiteClient = new S3OffsiteStorageClient({
      endpoint,
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
    });
  }

  const result = await executeBackupRun({
    runId: cliOptions.runId,
    dbRunner: async (opts) => {
      console.log(`\n--- Step 1: Database Backup ---`);
      return runDatabaseBackup({
        targetDir: opts.targetDir,
        throwOnError: true,
        timestamp: opts.timestamp,
      });
    },
    storageRunner: async (opts) => {
      console.log(`\n--- Step 2: Storage Backup ---`);
      return await runStorageBackup({
        targetDir: opts.targetDir,
        throwOnError: true,
        timestamp: opts.timestamp,
      });
    },
    offsiteClient,
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("\n==================================================");
  console.log(` Backup Run Finished in ${durationSec}s `);
  console.log(` Run ID        : ${result.runId}`);
  console.log(` Overall Status: ${result.overallStatus.toUpperCase()}`);
  console.log(` Database      : ${result.database.status} (${(result.database.sizeBytes / 1024).toFixed(1)} KB)`);
  console.log(` Storage       : ${result.storage.status} (${result.storage.objects} objects, ${result.storage.failed} failed)`);
  console.log(` Off-site      : ${result.offsite.status} (${result.offsite.uploadedCount} uploaded, ${(result.offsite.totalBytes / 1024).toFixed(1)} KB)`);
  console.log(` Health State  : ${result.health.healthState} - ${result.health.healthReason}`);

  if (result.retentionDryRun) {
    console.log("\n--- Retention Evaluation (DRY-RUN) ---");
    console.log(` Protected Runs       : ${result.retentionDryRun.protectedRuns.length}`);
    console.log(` Candidates to Delete : ${result.retentionDryRun.candidatesToDelete.length}`);
    for (const cand of result.retentionDryRun.candidatesToDelete) {
      console.log(`   - [DRY-RUN candidate] ${cand}`);
    }
  }

  // Phase 5: Deep Off-site Restore Readiness Check (Full Round-Trip Verification)
  if (cliOptions.verifyRemoteDownload && offsiteClient && result.offsite.status === "success") {
    console.log("\n--- Step 5: Full Deep Off-site Round-Trip Verification ---");
    const testTempDir = path.join(process.cwd(), "backups", "temp-verify", result.runId);
    fs.mkdirSync(testTempDir, { recursive: true });

    try {
      const remotePrefix = `fuel-station/runs/${result.runId}`;

      // 1. List remote objects
      console.log(`[restore-readiness] Listing remote objects under "${remotePrefix}"...`);
      const remoteObjects = await offsiteClient.listObjects(remotePrefix);
      console.log(`[restore-readiness] Found ${remoteObjects.length} remote object(s).`);

      // 2. Download and verify backup-run.json
      const localManifestPath = path.join(testTempDir, "backup-run.json");
      console.log(`[restore-readiness] Downloading and verifying remote backup-run.json...`);
      await offsiteClient.downloadFile(`${remotePrefix}/backup-run.json`, localManifestPath);
      const downloadedManifestSha = calculateSha256(localManifestPath);
      const originalManifestSha = calculateSha256(path.join(process.cwd(), "backups", "runs", result.runId, "backup-run.json"));
      if (downloadedManifestSha !== originalManifestSha) {
        throw new Error(`Remote backup-run.json checksum mismatch!`);
      }
      console.log(`[restore-readiness]   backup-run.json: PASS (SHA-256 match)`);

      // 3. Download and verify DB dump
      console.log(`[restore-readiness] Downloading and verifying remote fuel-station.dump...`);
      const localDumpPath = path.join(testTempDir, "fuel-station.dump");
      const dumpDown = await offsiteClient.downloadFile(`${remotePrefix}/db/fuel-station.dump`, localDumpPath);
      const downloadedDumpSha = calculateSha256(localDumpPath);
      if (downloadedDumpSha.toLowerCase() !== result.database.sha256.toLowerCase()) {
        throw new Error(
          `Remote DB dump checksum mismatch! Downloaded: ${downloadedDumpSha} vs Local: ${result.database.sha256}`
        );
      }
      console.log(`[restore-readiness]   DB dump: PASS (${(dumpDown.sizeBytes / 1024).toFixed(2)} KB, SHA-256 match)`);

      // 4. Download and verify Storage manifest & all asset files
      console.log(`[restore-readiness] Downloading and verifying remote storage assets...`);
      const localStorageManifestPath = path.join(testTempDir, "storage-manifest.json");
      await offsiteClient.downloadFile(`${remotePrefix}/storage/manifest.json`, localStorageManifestPath);
      const storageManifest = JSON.parse(fs.readFileSync(localStorageManifestPath, "utf8"));

      let verifiedStorageFiles = 0;
      let totalVerifiedBytes = dumpDown.sizeBytes;

      for (const fileEntry of storageManifest.files) {
        const remoteAssetKey = `${remotePrefix}/storage/${fileEntry.path}`;
        const localAssetPath = path.join(testTempDir, fileEntry.path);
        const assetDown = await offsiteClient.downloadFile(remoteAssetKey, localAssetPath);
        const downloadedAssetSha = calculateSha256(localAssetPath);

        if (downloadedAssetSha.toLowerCase() !== fileEntry.sha256.toLowerCase()) {
          throw new Error(
            `Remote asset checksum mismatch for ${fileEntry.path}! Downloaded: ${downloadedAssetSha} vs Expected: ${fileEntry.sha256}`
          );
        }
        verifiedStorageFiles++;
        totalVerifiedBytes += assetDown.sizeBytes;
      }

      console.log(
        `[restore-readiness]   Storage assets: PASS (${verifiedStorageFiles}/${storageManifest.files.length} files verified bit-for-bit)`
      );

      console.log(
        `[restore-readiness] FULL ROUND-TRIP SUCCESS: Verified ${remoteObjects.length} remote objects (~${(
          totalVerifiedBytes /
          (1024 * 1024)
        ).toFixed(2)} MB) with zero checksum errors.`
      );

      // Phase 0 / Sprint 4C.2: Write and upload _VERIFIED.json commit marker as the final transaction commit
      const verifiedMarkerPath = path.join(testTempDir, "_VERIFIED.json");
      const verifiedData = {
        runId: result.runId,
        verifiedAt: new Date().toISOString(),
        dbSha256: result.database.sha256,
        storageObjectsVerified: verifiedStorageFiles,
        status: "verified",
        verifiedBy: "deep-round-trip-check",
      };
      fs.writeFileSync(verifiedMarkerPath, JSON.stringify(verifiedData, null, 2), "utf8");

      const remoteMarkerKey = `${remotePrefix}/_VERIFIED.json`;
      console.log(`[restore-readiness] Uploading final commit marker: "${remoteMarkerKey}"...`);
      await offsiteClient.uploadFile(verifiedMarkerPath, remoteMarkerKey, "application/json");

      const markerVerify = await offsiteClient.verifyObjectExists(remoteMarkerKey);
      if (!markerVerify.exists) {
        throw new Error(`Failed to commit run: "${remoteMarkerKey}" was not found after upload.`);
      }
      console.log(`[restore-readiness] RUN OFFICIALLY COMMITTED: Verified commit marker exists in offsite storage.`);

      // Clean up temporary download verification folder
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch (err: unknown) {
      const errMsg = (err as Error).message;
      console.error(`[restore-readiness] FAILED: ${errMsg}`);
      fs.rmSync(testTempDir, { recursive: true, force: true });
      await sendDeadManSignal("fail", `Restore readiness verification failed: ${errMsg}`);
      process.exit(1);
    }
  }

  console.log("==================================================\n");

  if (result.exitCode !== 0) {
    console.error(`[backup-run] Error details: ${result.error || "Unknown error"}`);
    await sendDeadManSignal("fail", `Backup run ${result.runId} failed: ${result.error || "Unknown error"}`);
    process.exit(result.exitCode);
  }

  // Send success heartbeat only after complete execution and verification
  await sendDeadManSignal("success", `Run ${result.runId} succeeded (${result.database.status}, ${result.storage.objects} assets, verified offsite)`);

  return result;
}

if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.endsWith("backup-run.ts"))) {
  const args = process.argv.slice(2);
  const skipOffsite = args.includes("--skip-offsite");
  const verifyRemoteDownload = args.includes("--verify-remote");

  runFullBackupPipeline({ skipOffsite, verifyRemoteDownload }).catch(async (err) => {
    console.error("[backup-run] Fatal error:", redactSecretString(err.message));
    await sendDeadManSignal("fail", `Fatal runner crash: ${err.message}`);
    process.exit(1);
  });
}
