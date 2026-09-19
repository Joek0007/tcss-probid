import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Emails the fleet manager (via Mailgun — the same channel notify-quote-approval
// uses) when a tech reports a vehicle issue from the field. Reads the toggle and
// recipient list from company_settings.settings_json:
//   vehIssueEmailEnabled (bool), vehIssueEmailTo (comma/semicolon list).
// Falls back to notifyEmail/uemail/cemail if no explicit recipient set.
// Called from the client via supabase.functions.invoke('notify-vehicle-issue',
// { body: { id: <issueId> } }); verify_jwt keeps it to authenticated users.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function esc(s: string) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function json(o: unknown) {
  return new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
}

const SEV_COLOR: Record<string, string> = { low: "#546e7a", normal: "#1565c0", high: "#e65100", urgent: "#c62828" };

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({}));
    const idIn = (payload.record || payload.new || payload || {}).id;
    if (!idIn) return json({ ok: false, reason: "no id" });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: iss } = await sb.from("asset_issues").select("*").eq("id", idIn).single();
    if (!iss) return json({ ok: false, reason: "issue not found" });

    const { data: cs } = await sb.from("company_settings").select("settings_json").eq("id", 1).single();
    const s = (cs && cs.settings_json) || {};

    if (!s.vehIssueEmailEnabled) return json({ ok: false, reason: "alerts disabled" });

    const mgKey = s.mgKey;
    if (!mgKey) return json({ ok: false, reason: "no mailgun key" });
    const mgDomain = (s.mgDomain || "tcss.com").trim();
    const mgFrom = (s.mgFrom || ("TCSS ProBid <notifications@" + mgDomain + ">")).trim();

    const toRaw = (s.vehIssueEmailTo || s.notifyEmail || s.uemail || s.cemail || "").trim();
    const recips = Array.from(new Set(toRaw.split(/[,;]+/).map((x: string) => x.trim().toLowerCase()).filter(Boolean)));
    if (!recips.length) return json({ ok: false, reason: "no recipients" });

    const { data: veh } = await sb.from("assets").select("number,name,plate,make,model,year,assigned_tech").eq("id", iss.asset_id).single();
    const vlabel = veh ? (veh.number || veh.name || "Vehicle") : "Vehicle";
    const vsub = veh ? [veh.year, veh.make, veh.model].filter(Boolean).join(" ") : "";

    const sev = String(iss.severity || "normal");
    const accent = SEV_COLOR[sev] || "#1565c0";
    const subject = "🚚 Vehicle issue [" + sev.toUpperCase() + "]: " + vlabel + (iss.title ? " — " + iss.title : "");

    const html =
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0d1b2a">' +
        '<div style="border-left:4px solid ' + accent + ';padding:6px 14px;font-size:16px;font-weight:700">' +
          esc(iss.reporter_name || "A tech") + " reported an issue on <b>" + esc(vlabel) + "</b></div>" +
        '<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:13px">' +
          '<tr><td style="color:#90a4ae;padding:4px 10px;width:120px">Vehicle</td><td style="padding:4px 10px"><b>' + esc(vlabel) + "</b>" + (vsub ? " — " + esc(vsub) : "") + (veh && veh.plate ? " · " + esc(veh.plate) : "") + "</td></tr>" +
          '<tr><td style="color:#90a4ae;padding:4px 10px">Severity</td><td style="padding:4px 10px"><b style="color:' + accent + '">' + esc(sev.toUpperCase()) + "</b></td></tr>" +
          (iss.title ? '<tr><td style="color:#90a4ae;padding:4px 10px">Summary</td><td style="padding:4px 10px">' + esc(iss.title) + "</td></tr>" : "") +
          '<tr><td style="color:#90a4ae;padding:4px 10px">Details</td><td style="padding:4px 10px">' + esc(iss.description || "").replace(/\n/g, "<br>") + "</td></tr>" +
          '<tr><td style="color:#90a4ae;padding:4px 10px">Reported by</td><td style="padding:4px 10px">' + esc(iss.reporter_name || "—") + "</td></tr>" +
        "</table>" +
        (iss.photo_path ? '<div style="font-size:12px;color:#546e7a;padding:0 10px">📷 A photo is attached.</div>' : "") +
        '<div style="font-size:12px;color:#90a4ae;border-top:1px solid #eee;padding-top:10px;margin-top:10px">Sent automatically by TCSS ProBid when a tech reported the issue. Open the Vehicles page to acknowledge, resolve, or turn it into a work order.</div>' +
      "</div>";
    const text = subject + "\n\n" + html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    const form = new FormData();
    form.append("from", mgFrom);
    recips.forEach((r) => form.append("to", r));
    form.append("subject", subject);
    form.append("text", text);
    form.append("html", html);

    // Attach the tech's photo, if any (best-effort — never block the email on it).
    if (iss.photo_path) {
      try {
        const dl = await sb.storage.from("job-photos").download(iss.photo_path);
        if (dl && dl.data) {
          const fname = (String(iss.photo_path).split("/").pop() || "photo.jpg");
          form.append("attachment", dl.data, fname);
        }
      } catch (_e) { /* skip attachment on any error */ }
    }

    const res = await fetch("https://api.mailgun.net/v3/" + mgDomain + "/messages", {
      method: "POST",
      headers: { Authorization: "Basic " + btoa("api:" + mgKey) },
      body: form,
    });
    const body = await res.text();
    return json({ ok: res.ok, status: res.status, to: recips, mg: body.slice(0, 300) });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
