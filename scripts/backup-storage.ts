import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  generateBackupTimestamp,
  calculateSha256,
  redactSecretString,
  sanitizeStoragePath,
  calculateStorageStatus,
  createStorageManifest,
  StorageFileEntry,
} from "../lib/backup-helpers";

// Load environment files with fallback order: .env.local -> .env
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

export interface BackupStorageOptions {
  supabaseUrl?: string;
  supabaseKey?: string;
  bucketName?: string;
  outputBaseDir?: string;
}

interface StorageItem {
  name: string;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function runStorageBackup(options: BackupStorageOptions = {}) {
  const startTime = Date.now();

  const supabaseUrl =
    options.supabaseUrl ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    "https://doglpjixsyuhtabaxmib.supabase.co";

  const supabaseKey =
    options.supabaseKey ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "sb_publishable_68Dxw2zNu2ruFvXzmPhV1Q_2EoIJIfp";

  const bucketName = options.bucketName ?? "products";

  if (!supabaseUrl || !supabaseKey) {
    console.error("[backup-storage] ERROR: Supabase URL or Key is missing.");
    process.exit(1);
  }

  // Avoid Node 20 missing WebSocket error in Supabase Realtime client
  class DummyTransport {}
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: DummyTransport as unknown as typeof WebSocket },
  });

  const timestamp = generateBackupTimestamp();
  const baseDir = options.outputBaseDir ?? path.join(process.cwd(), "backups", "storage");
  const targetDir = path.join(baseDir, timestamp);

  if (fs.existsSync(targetDir)) {
    console.error(`[backup-storage] ERROR: Target backup directory already exists: ${targetDir}. Refusing to overwrite.`);
    process.exit(1);
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const bucketDownloadDir = path.join(targetDir, bucketName);
  fs.mkdirSync(bucketDownloadDir, { recursive: true });
  const manifestFilePath = path.join(targetDir, "manifest.json");

  console.log(`[backup-storage] Starting Storage backup for bucket "${bucketName}" at ${timestamp}`);
  console.log(`[backup-storage] Target directory: ${targetDir}`);
  console.log(`[backup-storage] Supabase Endpoint: ${redactSecretString(supabaseUrl)}`);

  // Recursively discover all objects in bucket with pagination
  const allObjects: { path: string; name: string }[] = [];

  async function listFolder(folderPrefix: string = ""): Promise<void> {
    const PAGE_SIZE = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase.storage.from(bucketName).list(folderPrefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(`Failed to list storage path "${folderPrefix}": ${error.message}`);
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of data as StorageItem[]) {
        const itemPath = folderPrefix ? `${folderPrefix}/${item.name}` : item.name;

        // In Supabase Storage, folders typically have id === null or metadata === null
        if (item.id === null && (!item.metadata || Object.keys(item.metadata).length === 0)) {
          // Recursive subfolder
          await listFolder(itemPath);
        } else {
          allObjects.push({ path: itemPath, name: item.name });
        }
      }

      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
    }
  }

  try {
    await listFolder("");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[backup-storage] Discovery error: ${redactSecretString(msg)}`);
    const failedManifest = createStorageManifest({
      createdAt: timestamp,
      bucket: bucketName,
      status: "failed",
      totalDiscovered: 0,
      totalDownloaded: 0,
      totalFailed: 0,
      durationMs: Date.now() - startTime,
      files: [],
      failedPaths: [],
      error: redactSecretString(msg),
    });
    fs.writeFileSync(manifestFilePath, JSON.stringify(failedManifest, null, 2), "utf8");
    process.exit(1);
  }

  console.log(`[backup-storage] Discovered ${allObjects.length} object(s) in bucket "${bucketName}"`);

  const downloadedFiles: StorageFileEntry[] = [];
  const failedPaths: string[] = [];

  for (const obj of allObjects) {
    try {
      const localFilePath = sanitizeStoragePath(bucketDownloadDir, obj.path);
      const localFileDir = path.dirname(localFilePath);
      if (!fs.existsSync(localFileDir)) {
        fs.mkdirSync(localFileDir, { recursive: true });
      }

      const { data, error } = await supabase.storage.from(bucketName).download(obj.path);

      if (error || !data) {
        throw new Error(error?.message ?? "Empty download response");
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(localFilePath, buffer);

      const sha256 = calculateSha256(buffer);
      const contentType = (data as Blob).type || "application/octet-stream";

      downloadedFiles.push({
        name: obj.name,
        path: `${bucketName}/${obj.path}`,
        sizeBytes: buffer.length,
        contentType,
        sha256,
        downloadedAt: new Date().toISOString(),
      });

      console.log(`[backup-storage] Downloaded: ${obj.path} (${buffer.length} bytes)`);
    } catch (downloadErr: unknown) {
      const errMsg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
      console.error(`[backup-storage] FAILED to download "${obj.path}": ${redactSecretString(errMsg)}`);
      failedPaths.push(obj.path);
    }
  }

  const durationMs = Date.now() - startTime;
  const status = calculateStorageStatus(allObjects.length, downloadedFiles.length, failedPaths.length);

  const manifest = createStorageManifest({
    createdAt: timestamp,
    bucket: bucketName,
    status,
    totalDiscovered: allObjects.length,
    totalDownloaded: downloadedFiles.length,
    totalFailed: failedPaths.length,
    durationMs,
    files: downloadedFiles,
    failedPaths,
  });

  fs.writeFileSync(manifestFilePath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`[backup-storage] Finished Storage backup in ${durationMs}ms with status: ${status}`);
  console.log(`[backup-storage] Total Discovered : ${allObjects.length}`);
  console.log(`[backup-storage] Total Downloaded : ${downloadedFiles.length}`);
  console.log(`[backup-storage] Total Failed     : ${failedPaths.length}`);
  console.log(`[backup-storage] Manifest written: ${manifestFilePath}`);

  if (status !== "success") {
    process.exit(1);
  }
}

// Execute when invoked directly from CLI
if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.endsWith("backup-storage.ts"))) {
  runStorageBackup().catch((err) => {
    console.error("[backup-storage] Fatal error:", redactSecretString(err.message));
    process.exit(1);
  });
}
