# Disaster Recovery & Backup Operations Runbook

> **Target Recovery Point Objective (Target RPO)**: 6 Hours  
> **Recovery Maturity Level**: Level 3 — Verified Restore  
> **Operational RPO Status**: *Target is 6 hours; Operational RPO is NOT YET PROVEN until scheduled pipeline history is accumulated.*

---

## 1. Architecture Overview

```
[Local / GitHub Actions Runner]
       │ (Every 6h: 00:17, 06:17, 12:17, 18:17 UTC)
       ▼
scripts/backup-run.ts (Orchestrator)
  ├── Step 1: PostgreSQL 17 logical dump (-Fc) -> backups/runs/<runId>/db/
  └── Step 2: Supabase Storage download       -> backups/runs/<runId>/storage/
       │
       ▼
Local Pre-upload Integrity Verification
  - Database dump > 0 bytes & SHA-256 matches & pg_restore --list passes
  - Storage files complete & SHA-256 matches & failed count === 0
       │
       ▼ (Only on 100% verified bundle)
Off-site Upload to Cloudflare R2 (Private S3-compatible storage)
  - Key Prefix: fuel-station/runs/<runId>/...
  - Refuses overwrite on duplicate runId
       │
       ▼
Remote Readiness Check & Retention Evaluation (DRY-RUN)
  - Remote verification: Confirm objects exist on R2
  - Retention: Candidates >30 days listed, but newest success is NEVER deleted
       │
       ▼
Health Status Update
  - Writes backups/backup-health.json
```

---

## 2. How to Run Backup Manually

### A. Full Unified Backup & Off-site Upload (Recommended)
Runs DB dump + Storage download + local checksum verification + off-site R2 upload + remote verification:

```bash
npm run backup:run
```

To test off-site download and round-trip checksum verification:
```bash
npm run backup:run -- --verify-remote
```

To run locally without off-site upload (creates verified local bundle only):
```bash
npm run backup:run -- --skip-offsite
```

### B. Individual Component Backups
* **Database logical dump only**:
  ```bash
  npm run backup:db
  ```
* **Product storage files only**:
  ```bash
  npm run backup:storage
  ```

---

## 3. How to Verify Latest Backup Status

Inspect `backups/backup-health.json`:

```json
{
  "lastAttemptAt": "2026-10-04T18:00:00.000Z",
  "lastSuccessfulBackupAt": "2026-10-04T18:00:00.000Z",
  "lastRunId": "2026-10-04T180000Z",
  "lastStatus": "success",
  "lastErrorCategory": "none",
  "databaseStatus": "success",
  "storageStatus": "success",
  "offsiteStatus": "success",
  "healthState": "HEALTHY",
  "healthReason": "Latest successful backup is fresh (0.0h ago <= 8h window)"
}
```

### Health States:
* **`HEALTHY`**: Latest successful verified backup age $\le$ 6 hours (+ 2 hours grace period = 8 hours total).
* **`DEGRADED`**: Latest attempt failed, but previous successful backup is still within the 8-hour window, OR a successful backup is older than 8 hours. Requires operator investigation.
* **`FAILED`**: Latest run failed and no valid backup exists within the 8-hour window. Immediate operator intervention required.

---

## 4. Off-site Storage Details (Cloudflare R2)

* **Bucket**: `fuel-station-backups-offsite` (Private bucket only, public access blocked).
* **Key Structure**:
  * `fuel-station/runs/<runId>/db/fuel-station.dump`
  * `fuel-station/runs/<runId>/db/fuel-station.dump.sha256`
  * `fuel-station/runs/<runId>/db/manifest.json`
  * `fuel-station/runs/<runId>/storage/products/...`
  * `fuel-station/runs/<runId>/storage/manifest.json`
  * `fuel-station/runs/<runId>/backup-run.json`
  * `fuel-station/temporary/` (for incomplete uploads; 1–7 day auto-cleanup)
* **Required Environment Variables**:
  * `OFFSITE_S3_ENDPOINT`: Cloudflare R2 account endpoint (`https://<account-id>.r2.cloudflarestorage.com`)
  * `OFFSITE_S3_BUCKET`: `fuel-station-backups-offsite`
  * `OFFSITE_S3_REGION`: `auto`
  * `OFFSITE_S3_ACCESS_KEY_ID`: Restricted R2 token Access Key
  * `OFFSITE_S3_SECRET_ACCESS_KEY`: Restricted R2 token Secret Key

---

## 5. Retention Policy & Safety Rules

1. **Target Retention**: 30 Days.
2. **Cardinal Invariant**: The **newest successful verified backup must NEVER be deleted**, even if the system has been broken or stagnant for more than 30 days.
3. **No Blanket Bucket Expiration**: Do not apply a global 30-day bucket lifecycle deletion rule to `fuel-station/runs/` because cloud bucket lifecycles do not inspect application health and could erase the last remaining good backup.
4. **Dry-Run Enforcement**: In this phase, retention evaluation is strictly **DRY-RUN only**. Candidates older than 30 days are logged but not automatically deleted.

---

## 6. How to Execute Database Restore Drill

The restore drill validates that a backup archive can be completely restored into an isolated PostgreSQL database, verifying schema, constraints, indexes, 0 foreign key orphans, 100% row count parity, and Prisma read/write operations.

```bash
npm run restore:drill
```

### Safety Guard Requirements:
* Must configure `RESTORE_DRILL_DATABASE_URL` pointing strictly to a local loopback database (e.g. `postgresql://postgres:postgres@127.0.0.1:54333/fuel_station_restore`).
* `lib/restore-safety.ts` enforces a strict **Positive Local Allowlist** (`localhost`, `127.0.0.1`, `::1`).

---

## 7. Critical "What NOT to Do"

> [!CAUTION]
> 1. **NEVER run `restore:drill` against a non-loopback target.** Any remote IP, AWS RDS, Neon, Supabase, or production host is strictly rejected by `validateRestoreTarget`. Never bypass this check.
> 2. **NEVER modify production data during drills.** All backup operations must be read-only.
> 3. **NEVER expose or commit secrets.** Credentials in connection strings, JWT tokens, and S3 keys must remain in `.env` / secret stores and must be redacted in logs using `redactSecretString`.
> 4. **NEVER commit backup artifacts or `.dump` files.** The `backups/` directory is ignored by Git.
> 5. **NEVER trust an upload without verification.** Always check dump readability (`pg_restore --list`) and SHA-256 hashes before and after upload.
