async function lemonActivate(license_key, instance_name, env) {
  const form = new URLSearchParams();
  form.set("license_key", license_key);
  form.set("instance_name", instance_name);

  const r = await fetch("https://api.lemonsqueezy.com/v1/licenses/activate", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Bearer ${env.LEMON_API_KEY}`,
    },
    body: form.toString(),
  });

  let j = null;
  try { j = await r.json(); } catch { j = null; }

  return { ok: r.ok, status: r.status, json: j };
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);

    // CORS preflight (safe)
    if (request.method === "OPTIONS") {
      return new Response("", {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (u.pathname !== "/v1/verify" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, status: "invalid", message: "Invalid JSON" }, { status: 400 });
    }

    const license_key = String(body.license_key || "").trim();
    if (!license_key) {
      return Response.json({ ok: false, status: "invalid", message: "License key missing" }, { status: 400 });
    }

    const instance_id = String(body.instance_id || "").trim();

    // Lemon License API: validate a license key (form-encoded)
    const form = new URLSearchParams();
    form.set("license_key", license_key);
    if (instance_id) form.set("instance_id", instance_id);

    const r = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Bearer ${env.LEMON_API_KEY}`,
      },
      body: form.toString(),
    });

    const serverNow = Math.floor(Date.now() / 1000);

    let j = null;
    try { j = await r.json(); } catch { j = null; }

    if (!r.ok || !j || j.valid !== true) {
      const msg = (j && j.error) ? String(j.error) : `Lemon validate failed (HTTP ${r.status})`;
      return Response.json({
        ok: true,
        entitled: false,
        status: "invalid",
        message: msg,
        server_time_ts: serverNow,
        current_period_end_ts: serverNow + 3600,
        grace_days: 7,
        next_check_after_ts: serverNow + 3600,
      });
    }

    const lk = j.license_key || {};
    const lkStatus = String(lk.status || "").toLowerCase();

    // We need a stable machine id to bind activations to
    const machine_id = String(body.machine_id || "").trim();
    if (!machine_id) {
      return Response.json({ ok: false, status: "invalid", message: "machine_id missing" }, { status: 400 });
    }

    if (instance_id) {
      if (j.instance) {
        // Lemon confirmed this instance id belongs to this key
        return Response.json({
          ok: true,
          entitled: true,
          status: lkStatus || "active",
          message: "OK",
          server_time_ts: serverNow,
          current_period_end_ts: serverNow + 86400,
          grace_days: 7,
          next_check_after_ts: serverNow + 86400,
        });
      }

      // instance_id was provided but Lemon didn't confirm it -> treat as invalid/bad instance
      return Response.json({
        ok: true,
        entitled: false,
        status: "invalid_instance",
        message: "Invalid instance_id for this license_key",
        server_time_ts: serverNow,
        current_period_end_ts: serverNow + 3600,
        grace_days: 7,
        next_check_after_ts: serverNow + 3600,
      });
    }

    // Hard failures
    if (lkStatus === "disabled" || lkStatus === "expired") {
      return Response.json({
        ok: true,
        entitled: false,
        status: lkStatus,
        message: `Not entitled: ${lkStatus}`,
        server_time_ts: serverNow,
        current_period_end_ts: serverNow + 86400,
        grace_days: 7,
        next_check_after_ts: serverNow + 86400,
      });
    }

    // If not activated yet, activate now (this is what flips inactive -> active)
    const a = await lemonActivate(license_key, machine_id, env);
    console.log("ACTIVATE_JSON:", JSON.stringify(a.json));

    // Activation success
    if (a.ok && a.json && a.json.activated === true) {
      const newInstanceId =
        a.json?.instance?.id ||
        a.json?.instance_id ||
        a.json?.identifier ||
        null;

      return Response.json({
        ok: true,
        entitled: true,
        status: "active",
        message: "OK (activated)",
        instance_id: newInstanceId,
        server_time_ts: serverNow,
        current_period_end_ts: serverNow + 86400,
        grace_days: 7,
        next_check_after_ts: serverNow + 86400,
      });
    }

    // Activation failed (often: activation limit reached)
    const errMsg = (a.json && a.json.error) ? String(a.json.error) : `Lemon activate failed (HTTP ${a.status})`;

    // If you want: detect limit-reached more cleanly later
    return Response.json({
      ok: true,
      entitled: false,
      status: "activation_failed",
      message: errMsg,
      server_time_ts: serverNow,
      current_period_end_ts: serverNow + 3600,
      grace_days: 7,
      next_check_after_ts: serverNow + 3600,
    });
  },
};