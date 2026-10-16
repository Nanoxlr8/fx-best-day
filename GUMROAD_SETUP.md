# Gumroad Product Setup — FX Best-Day Pro

You sell the **Pro license key** here. Buyers get a key that unlocks the
watchlist + Telegram digest in the extension. The extension code is free
(open-source on GitHub); Pro is a license.

---

## 1. Create the product (5 min)

1. Go to **[gumroad.com](https://gumroad.com)** → sign up / log in.
2. **New product** →
   - **Title:** `FX Best-Day — Pro License (lifetime)`
   - **Price:** **$12** one-time (recommended; $9–19 is the sane range)
   - **Type:** `Software / License key` (or "Product" with a txt file)
   - **Upload:** a tiny `README.txt` ("Your license key is shown after
     purchase. Paste it into FX Best-Day → Options → Pro.")
   - **Enable license keys:** Gumroad auto-generates a key per sale.
     (We use our OWN key format `FXPRO-…`; you can ignore Gumroad's
      generated keys and send buyers the `FXPRO-` key from your generator,
      OR just use Gumroad keys + swap the prefix. Simpler: use Gumroad keys
      and change `PRO_KEY_PREFIX` to match. Documented below.)
3. **Publish.**

## 2. Wire real verification (optional but recommended)

The extension checks keys via a serverless worker that calls Gumroad's
license API. Deploy `license-worker.js` (in this repo):

- **Cloudflare:** `wrangler deploy` (free tier covers this easily)
- Set secrets: `GUMROAD_API_KEY` (your Gumroad app token),
  `GUMROAD_PRODUCT_PERMALINK` (the product's permalink).
- Copy the deployed URL and set `VERIFY_URL` in `fx-core.js`.

Until you do this, the extension uses **local checksum only** (deters casual
copying, not determined attackers). That's fine for a $12 product to start.

## 3. Listing copy (paste into Gumroad description)

> ### ⭐ FX Best-Day Pro — never convert on a bad day again
>
> You already use the free FX Best-Day extension to know the best day to
> convert one currency pair. **Pro** unlocks:
>
> - 🔥 **Multi-pair watchlist** — track USD→EGP, GBP→EGP, EUR→USD side by side
> - 🔥 **Daily Telegram digest** — wake up to a private message: *which pair
>   to convert today*
> - Custom alert threshold
>
> **One-time payment. Lifetime license.** No subscription.
>
> After purchase you'll get a license key — paste it into the extension's
> Options → Pro panel and everything unlocks instantly.
>
> (The base extension is 100% free and open-source. Pro is the automation.)

## 4. Promotion

- Add purchase details to the extension's official listing when it is ready.
- Post in r/chromeextensions, r/Remittance, Egyptian freelancer Facebook groups.
- Short demo video (screen-record the popup) on TikTok/YouTube Shorts.

## 5. Payout

Gumroad pays to your bank/PayPal. As a non-US seller this works; set up
payout details in Gumroad settings first.
