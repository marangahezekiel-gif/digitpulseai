# DigitpulseAi security notes (owner only)

## What the code protects
- **Secrets** live only in Vercel environment variables (ADMIN_KEY, the Upstash tokens, the M-Pesa keys). None is in the code or in the git history (checked on every branch). `.gitignore` blocks `.env` files from being committed.
- **/admin** and `/api/admin`: every call needs the ADMIN_KEY (checked in constant time). 10 wrong tries lock an address for about 15 minutes. If ADMIN_KEY is missing or shorter than 12 characters the admin API switches itself off.
- **Cross-site protection**: the endpoints refuse requests that come from another website (Origin / Sec-Fetch-Site check) and oversized requests.
- **Rate limits** on payment requests, status checks, key redemption, Deriv login, M-Pesa prompts, offer checks and wrong M-Pesa callback secrets. Counters always get an expiry, so they cannot get stuck.
- **M-Pesa**: the amount is worked out on the server, the callback address is fixed (`SITE_URL`, default https://digitpulseai.site), the callback needs a secret, and every success is re-checked with Safaricom before approving.
- **Input**: ids and keys are matched against strict patterns; text is stripped of control characters and angle brackets; the pages build HTML with escaping or DOM calls.
- **Headers** (vercel.json): Content-Security-Policy (site and admin), X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy. API answers are never cached.
- **No third-party packages**, so nothing to patch in dependencies. Node 20 or newer.
- README.md, ADMIN_SETUP.md and SECURITY.md are not published on the website (`.vercelignore`).

## What you must do yourself (I cannot do these from here)
1. In Vercel, make sure ADMIN_KEY is a long random value (30+ characters), not a word. If it was ever shared, written in chat or committed anywhere, change it.
2. Mark every secret as **Sensitive** in Vercel environment variables, and keep Production only where possible.
3. Turn on two-step login (2FA) on GitHub, Vercel, Upstash and your Safaricom Daraja account.
4. Keep the GitHub repository **private** if it is not already.
5. If the Upstash token or any M-Pesa key was ever pasted anywhere public, rotate it (Upstash: "Reset token"; Daraja: regenerate).
6. Never push from another tool to `main` without pulling first (a push from VS replaced the whole site once).

## Known limits (honest)
- The signal analysis runs in the visitor's browser from public Deriv prices, so the "paid" lock is a client-side lock. Someone technical could bypass it on their own device; it is not a vault. Moving the analysis to the server would be needed to make it enforceable.
- The page still needs `'unsafe-inline'` in the content policy because the buttons use inline handlers. The policy still blocks scripts and connections to unknown websites.
- Access keys are kept readable in the database so you can send them to clients. They are looked up by hash, and the database is only reachable with your Upstash token.
- There are no user passwords. The only secret login is your ADMIN_KEY.
