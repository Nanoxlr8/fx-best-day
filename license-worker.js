// Cloudflare Worker (or Vercel Edge) — Gumroad license verification.
// Deploy free: `wrangler deploy` (Cloudflare) or Vercel function.
// ENV: GUMROAD_API_KEY = your Gumroad "Applications" API token.
//
// Endpoint: GET /verify?key=FXPRO-XXXX-XX&product=<optional>
// Returns JSON: { "valid": true } or { "valid": false, "reason": "..." }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!key) return json({ valid: false, reason: "missing key" }, 400);

    // 1) Local checksum fast-reject (deters malformed keys without a call)
    const k = key.trim().toUpperCase();
    if (!k.startsWith("FXPRO-")) return json({ valid: false, reason: "bad prefix" });

    // 2) Ask Gumroad whether this license is valid + not refunded
    const gum = await fetch(
      "https://api.gumroad.com/v2/licenses/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_permalink: env.GUMROAD_PRODUCT_PERMALINK || undefined,
          license_key: k,
          api_key: env.GUMROAD_API_KEY
        })
      }
    ).then(r => r.json()).catch(() => null);

    if (!gum || !gum.success) {
      return json({ valid: false, reason: "gumroad rejected" });
    }
    if (gum.purchase && gum.purchase.refunded) {
      return json({ valid: false, reason: "refunded" });
    }
    return json({ valid: true, email: gum.purchase?.email ?? null });
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
