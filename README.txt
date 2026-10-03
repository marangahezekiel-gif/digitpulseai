DigitpulseAi - front end (no backend)

HOW TO PUBLISH
Upload this folder to any static host (for example Vercel) with index.html at the top level.
Framework: Other. No build command.

DERIV LOGIN
The login uses Deriv's OAuth2 (PKCE) flow. It only completes on the site address registered
for your app in the Deriv developer dashboard: https://digitpulseai.site/ (match it exactly,
including the trailing slash). It cannot complete when index.html is opened from your computer.

SETTINGS (top of the <script> in index.html)
  APP_ID, SITE   Deriv app id and your site address
  SCOPE          Deriv permission requested at login (currently "trade")
  WA, USDT, MPESA, PAYEE   WhatsApp number and payment details
  MAIL           email that receives client reviews
  PLANS          plan names, prices, features
  REV            sample client reviews - replace with real ones before going live
  PREVIEW        true = shows "Open Dashboard (preview)" / "Preview dashboard" buttons and the
                 plan picker so you can test. false = hides them.
  GO             Matches signal: strength score at or above this shows TRADE NOW (default 80)

IMPORTANT NOTES
  - With PREVIEW=true, anyone on your live site can open the dashboard without paying.
  - With PREVIEW=false, no one can reach the dashboard yet, because approval needs a backend
    (an admin page where you approve payments). Until then the waiting-for-approval status is
    saved only in the visitor's own browser.
  - With PREVIEW=false, if the live Deriv price feed cannot connect, the dashboard shows a
    connection message instead of signals.
  - Signals describe recent tick patterns only. Digit outcomes are random and nothing here
    predicts the next digit or guarantees profit.
