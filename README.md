# DigitpulseAi

Deriv digit analysis front end with a Deriv login, plan billing (USDT TRC20 and M-Pesa), WhatsApp payment confirmation, a signal dashboard and an owner-only admin panel for approving payments.

## What is in this repo

| Path | What it is |
| --- | --- |
| `index.html` | The client site: landing page, Deriv login, plans, payment, waiting for approval, signal dashboard |
| `admin.html` | The admin panel, served at `/admin` |
| `api/request.js` | A client registers that they paid |
| `api/status.js` | The client site checks whether it was approved |
| `api/admin.js` | Owner-only: list, approve, reject, remove access, delete |
| `api/_lib.js` | Shared helpers |
| `vercel.json` | Clean URLs and security headers |
| `ADMIN_SETUP.md` | Step-by-step setup and daily use of the admin panel |

## Deploy on Vercel

1. Import this repo as a new project. Framework: **Other**. Leave the build settings empty.
2. Add the domain `digitpulseai.site`.
3. Follow `ADMIN_SETUP.md` to add the database and the `ADMIN_KEY` secret, then redeploy.

## Settings

Edit the top of the `<script>` in `index.html`:

- `APP_ID`, `SITE`, `SCOPE`: Deriv app id, the site address and the login permission. The redirect URL in your Deriv app must be exactly `https://digitpulseai.site/`.
- `WA`, `USDT`, `MPESA`, `PAYEE`: WhatsApp number and payment details.
- `MAIL`: where client reviews are sent.
- `PLANS`, `REV`: plans and sample reviews (replace the sample reviews with real ones).
- `PREVIEW`: `false` in this repo. Set it to `true` only to test locally, because it shows test buttons that skip payment.
- `GO`: Matches strength score needed to show TRADE NOW (default 80).

## Notes

Signals describe recent tick patterns only. Digit outcomes are random, and nothing here predicts the next digit or guarantees profit.

## Access keys and languages

- `api/redeem.js` lets a client unlock the site with an owner-issued access key (max 2 devices per key). Keys are created and reset in `/admin`.
- The plan cards work in two steps: **Choose plan** selects a card and its button becomes **Proceed to payment**.
- The language button opens a searchable list of about 133 languages. English and Swahili are built in; the others use the Google website translator, loaded only when a client picks one. Right-to-left languages (Arabic, Hebrew, Persian, Urdu and others) flip the page direction.

## M-Pesa prompt and install as app

`api/mpesa.js` sends an M-Pesa prompt, `api/mpesa-callback.js` receives Safaricom's answer and approves the plan after re-checking it with Safaricom. It needs Daraja credentials in environment variables (see ADMIN_SETUP.md) and is off without them. `manifest.webmanifest`, `sw.js` and the `icon*` files make the site installable.
