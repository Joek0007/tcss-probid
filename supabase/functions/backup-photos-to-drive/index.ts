// ============================================================
// Supabase Edge Function: backup-photos-to-drive
// ------------------------------------------------------------
// Weekly off-site backup of ProBid Storage photos to Google Drive.
// Runs entirely server-side (no Claude session, no user device):
//   1. Lists every object in the photo buckets using the service role.
//   2. Downloads each file's bytes.
//   3. Bundles them into one dated .zip (+ a MANIFEST.txt).
//   4. Uploads the zip to a Google Drive folder via a service account.
//
// Why this exists: Supabase Pro's automatic daily backups cover the DATABASE
// but NOT Storage files (tool/job photos). This closes that gap.
//
// Secrets (set in Supabase → Edge Functions → Secrets; NEVER in code):
//   GOOGLE_SA_JSON   full service-account JSON key (string)
//   DRIVE_FOLDER_ID  id of the "ProBid Backups" Drive folder (shared w/ the SA)
//   BACKUP_SECRET    random string; callers must send it as x-backup-secret
// Auto-provided by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy with verify_jwt = false (the x-backup-secret header is the gate).
// ============================================================
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SA_JSON       = Deno.env.get("GOOGLE_SA_JSON")!;
const DRIVE_FOLDER  = Deno.env.get("DRIVE_FOLDER_ID")!;
const BACKUP_SECRET = Deno.env.get("BACKUP_SECRET")!;
const BUCKETS       = ["tool-photos", "job-photos"];

const b64url = (s: string) => btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const b64urlBytes = (u: Uint8Array) => {
  let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

// Mint a Google OAuth2 access token from the service account (RS256 JWT bearer).
async function getAccessToken(): Promise<string> {
  const sa = JSON.parse(SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const pemBody = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, strToU8(unsigned)));
  const jwt = `${unsigned}.${b64urlBytes(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("google token: " + JSON.stringify(j));
  return j.access_token;
}

// Recursively list every object path in a bucket (service role bypasses RLS).
async function listAll(bucket: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(prefix: string) {
    let offset = 0;
    while (true) {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
      });
      const items = await r.json();
      if (!Array.isArray(items) || items.length === 0) break;
      for (const it of items) {
        const full = prefix ? `${prefix}/${it.name}` : it.name;
        if (it.id === null && it.metadata === null) await walk(full); // sub-folder
        else out.push(full);
      }
      if (items.length < 100) break;
      offset += 100;
    }
  }
  await walk("");
  return out;
}

async function download(bucket: string, path: string): Promise<Uint8Array> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    headers: { "Authorization": `Bearer ${SERVICE_ROLE}` },
  });
  if (!r.ok) throw new Error(`download ${bucket}/${path}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

Deno.serve(async (req) => {
  try {
    const secret = req.headers.get("x-backup-secret") || new URL(req.url).searchParams.get("secret");
    if (!BACKUP_SECRET || secret !== BACKUP_SECRET) return new Response("forbidden", { status: 403 });

    const files: Record<string, Uint8Array> = {};
    const manifest: string[] = [`ProBid Storage backup — ${new Date().toISOString()}`, ""];
    let total = 0;
    for (const b of BUCKETS) {
      const paths = await listAll(b);
      for (const p of paths) {
        const bytes = await download(b, p);
        files[`${b}/${p}`] = bytes;
        manifest.push(`${b}/${p}\t${bytes.length} bytes`);
        total += bytes.length;
      }
    }
    manifest.push("", `${Object.keys(files).length} files, ${total} bytes`);
    files["MANIFEST.txt"] = strToU8(manifest.join("\n"));

    const zipped = zipSync(files, { level: 6 });
    const stamp = new Date().toISOString().slice(0, 10);
    const token = await getAccessToken();

    const boundary = "pbb" + crypto.randomUUID();
    const meta = JSON.stringify({ name: `probid-photos-${stamp}.zip`, parents: [DRIVE_FOLDER] });
    const pre = strToU8(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
    );
    const post = strToU8(`\r\n--${boundary}--`);
    const body = new Uint8Array(pre.length + zipped.length + post.length);
    body.set(pre, 0); body.set(zipped, pre.length); body.set(post, pre.length + zipped.length);

    const up = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
      { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body },
    );
    const uj = await up.json();
    if (!up.ok) throw new Error("drive upload: " + JSON.stringify(uj));

    return new Response(
      JSON.stringify({ ok: true, file: uj.name, driveId: uj.id, files: Object.keys(files).length - 1, bytes: zipped.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e && (e as Error).message) || e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
