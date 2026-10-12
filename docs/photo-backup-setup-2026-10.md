# Weekly Photo Backup → Google Drive (setup + runbook, Oct 2026)

> **Why:** Supabase Pro auto-backups cover the DATABASE but NOT Storage files (tool & job photos). This is an automatic weekly off-site copy of both photo buckets to Google Drive, running fully server-side (Supabase Edge Function + pg_cron) — no Claude session or user device needed.

## Architecture

- **Edge Function `backup-photos-to-drive`** (deployed 2026-10-06, `verify_jwt=false`, gated by a secret header). It: lists every object in `tool-photos` + `job-photos` using the service role → downloads each → zips them with a `MANIFEST.txt` → uploads one `probid-photos-YYYY-MM-DD.zip` to the Drive folder via a Google service account.
- **Schedule:** `pg_cron` calls the function weekly via `pg_net`.
- **Destination:** Drive folder "ProBid Backups" — `1-KohLrunSWWSJ6pfQG4ln2D7599uMUWm` (owner joekucinski@gmail.com).
- Source lives in the repo at `supabase/functions/backup-photos-to-drive/index.ts`.

## One-time setup (Joe) — Google service account

1. **console.cloud.google.com** → create a project (e.g. "ProBid Backups") or reuse one.
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → Credentials → Create Credentials → Service account**. Name `probid-backup` → Create and continue → skip optional roles → Done.
4. Click the new service account → **Keys** tab → **Add Key → Create new key → JSON** → download the file (keep it private).
5. Copy the service account **email** (`probid-backup@<project>.iam.gserviceaccount.com`).
6. Open the **ProBid Backups** Drive folder → **Share** → add that email as **Editor** (uncheck "notify people").

## One-time setup (Joe) — Supabase secrets

Supabase dashboard → **Edge Functions → Secrets** (or Project Settings → Edge Functions). Add:

| Secret | Value |
|---|---|
| `GOOGLE_SA_JSON` | the ENTIRE contents of the downloaded .json key file |
| `DRIVE_FOLDER_ID` | `1-KohLrunSWWSJ6pfQG4ln2D7599uMUWm` |
| `BACKUP_SECRET` | `2528efef0d4d7e4a6462fbcff4e32e3c2671b7703719ffe7` |

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the function automatically — do not set them.) The SA private key stays inside Supabase; it never passes through chat or a prompt.

## Go-live (Claude, after secrets are set)

1. **Prove it:** trigger the function once via `pg_net` and confirm a `probid-photos-<date>.zip` appears in the Drive folder with the right file count.
2. **Enable pg_cron** (if not already) and schedule weekly:

```sql
create extension if not exists pg_cron;
select cron.schedule(
  'weekly-photo-backup',
  '0 8 * * 1',  -- Mondays 08:00 UTC
  $$
  select net.http_post(
    url     := 'https://jzvoksidbelxibzbizvi.supabase.co/functions/v1/backup-photos-to-drive',
    headers := jsonb_build_object('x-backup-secret','2528efef0d4d7e4a6462fbcff4e32e3c2671b7703719ffe7','Content-Type','application/json'),
    body    := '{}'::jsonb
  );
  $$
);
```

To change the time or stop it later: `select cron.unschedule('weekly-photo-backup');` then reschedule.

## Manual run / restore

- **Run on demand:** the go-live `net.http_post` call (above) with the secret header.
- **Restore:** download the dated zip from the Drive folder, unzip; each file is at `<bucket>/<original path>`, and `MANIFEST.txt` lists everything with sizes. Re-upload to the matching bucket/path in Supabase Storage if ever needed.

## Status

- [x] Edge function written + deployed (`backup-photos-to-drive`, v1).
- [x] Drive destination folder created.
- [ ] Joe: Google service account + folder share + 3 Supabase secrets.
- [ ] Claude: live test backup verified in Drive.
- [ ] Claude: weekly schedule enabled.

## Data size at setup

13 files, ~4.6 MB (job-photos 11 / 4.4 MB, tool-photos 2 / 125 kB). Grows with rollout; in-memory zip is fine well into the tens of MB.
