# DigitpulseAi admin setup

The admin panel lives at **https://digitpulseai.site/admin**. It only works with a secret key that you create. Follow these steps once.

## 1. Add the database (about 2 minutes)

1. In Vercel, open the `digitpulseai` project and go to **Storage**.
2. Choose **Upstash Redis** from the Marketplace and pick the free plan.
3. Connect it to the `digitpulseai` project. Vercel adds the connection settings for you (`KV_REST_API_URL` and `KV_REST_API_TOKEN`, or the `UPSTASH_REDIS_REST_*` pair). The code accepts both.

## 2. Create your admin key

1. Make a long random key, at least 24 characters. A password manager can generate one, or run `openssl rand -base64 24` in a terminal.
2. In Vercel go to **Settings, Environment Variables** and add:
   - Name: `ADMIN_KEY`
   - Value: your key (no quotes)
   - Environments: Production, Preview and Development
3. Save the key in your password manager. Do not put it in the code, in GitHub, or in a chat.

## 3. Redeploy

Environment variables only apply to new deployments. Open **Deployments**, choose the latest one, and select **Redeploy**.

## 4. Sign in

Open `https://digitpulseai.site/admin` and enter your key. Without the key the page shows nothing and changes nothing.

## Everyday use

1. A client pays, sends the screenshot on WhatsApp and taps "I have made the payment". Their request appears under **Waiting**.
2. Check that the money arrived in M-Pesa or your USDT wallet.
3. Tap **Approve** (change the plan first if they paid for a different one). Their page unlocks on its own within about 20 seconds and stays unlocked for 365 days.
4. **Reject** is for payments you could not verify. **Remove access** takes access back. **Delete** erases the request.

## How "only you" is enforced

- Every admin action is checked on the server against `ADMIN_KEY`. Hiding the page address is not what protects it.
- 10 wrong keys from one address locks that address out for about 15 minutes.
- If `ADMIN_KEY` is missing or shorter than 12 characters, the admin API stays switched off.
- The key is kept in the browser tab only until you close it or tap **Sign out**.
- To change the key, edit `ADMIN_KEY` in Vercel and redeploy. The old key stops working.
- Sign in only on your own devices.

## Good to know

- Approval belongs to the client's browser. If a client switches phone or browser they will need to submit a new request, and you can approve it again.
- The signal analysis runs in the visitor's browser, so someone technical could bypass the lock on their own screen. It protects normal use, not a determined developer. Running the analysis on the server would close that gap.
- Rate limits: 8 payment requests per hour per address, 300 status checks per 10 minutes per address.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| "Admin is not set up yet" | `ADMIN_KEY` is missing or shorter than 12 characters, or the database is not connected. Fix it, then redeploy. |
| "That key is not correct." | Re-copy the key from your password manager. |
| "Too many wrong attempts" | Wait about 15 minutes. |
| "Could not reach the server" | Check your connection and that the latest deployment finished. |
| No requests appear after a client paid | Check the database is connected. The client's page shows a note if it could not register, and they can still send the screenshot on WhatsApp. |

## Access keys

Besides approving payments, you can give a client an **access key** (for example `DPAI-K7QM-WX4R-TP9D`).

- **For someone who paid you directly:** in `/admin`, open **New access key**, choose the plan, type their name or WhatsApp number and tap **Create key**. Tap **Send on WhatsApp** to message it to them.
- **For payments through the site:** when you tap **Approve**, a key is created automatically and shown on the card (Active tab). Clients approved on their own device do not need it; it is there if they change phone.
- The client opens the site and taps **Access using a key** (home page or login) or **Proceed using a key** (under the waiting-for-approval card).
- One key works on **2 devices**. A client who clears their browser or changes phone may hit the limit: tap **Reset key** on their card. It creates a new key and unlinks every device. Send them the new one.
- **Remove access** switches the key off. **Delete** removes the client and the key.
- Wrong keys are rate limited: 10 wrong tries locks that network out for about 15 minutes.
- A key unlocks the site without a Deriv login. Keep keys private.

New API file: `api/redeem.js`. No new environment variables are needed.

## Automatic M-Pesa payments (optional)

The site can send the client an M-Pesa prompt (STK push) on their phone. When they enter their PIN, Safaricom tells the site, the payment is checked again with Safaricom, and the plan is approved automatically with an access key. You see the M-Pesa receipt on the client's card.

It stays **off** until you set it up. A personal number such as 0741080064 cannot receive prompts: you need a **Safaricom business till or paybill** and a Daraja app.

1. Register at developer.safaricom.co.ke, create an app with **Lipa na M-Pesa**, and ask Safaricom to take it live (Go Live) with your till or paybill. Safaricom gives you the Consumer Key, Consumer Secret, Shortcode and Passkey.
2. In Vercel, Settings, Environment Variables, add:
   - `MPESA_CONSUMER_KEY` and `MPESA_CONSUMER_SECRET`
   - `MPESA_SHORTCODE` (your till or paybill) and `MPESA_PASSKEY`
   - `MPESA_TXN_TYPE`: `CustomerBuyGoodsOnline` for a till (default) or `CustomerPayBillOnline` for a paybill
   - `MPESA_PARTYB`: only if Safaricom gave you a separate till number for a store/head-office shortcode
   - `MPESA_CALLBACK_SECRET`: any long random text (it becomes part of the address Safaricom calls back)
   - `MPESA_ENV`: `sandbox` while testing, leave empty when live
   - `MPESA_KES_RATE`: optional fixed dollar-to-shilling rate; otherwise a daily public rate is used
3. Redeploy. Open the payment page, choose M-Pesa: the "Pay with an M-Pesa prompt" box appears. If a variable is missing, the box stays hidden and the WhatsApp screenshot flow works as before.

Test with `MPESA_ENV=sandbox` first. The amount is always worked out on the server from the plan price, and a payment of a lower amount is never approved.

## Install as an app

The site is installable: Chrome and Edge on Android and desktop show an "Install app" button at the top; on iPhone, tap Share in Safari, then "Add to Home Screen". It gets its own icon and opens full screen. Only the site's own page and icons are saved for offline opening; payments, keys and login always use the network.
