MotionWraps final Vercel package

Files:
- index.html
- api/paypal/create-order.js
- api/paypal/capture.js

Vercel environment variables supported:
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET

Also accepts common alternate names if those were used earlier.
For live PayPal, leave PAYPAL_MODE unset or set it to live.
For sandbox testing, set PAYPAL_MODE=sandbox and use sandbox credentials.

Checkout behavior:
- Product: €25 per set
- MOTION10: 5% off
- Latvia shipping: €3.99
- Estonia/Lithuania: €5.99
- Europe: €10.99
- Rest of World: €16.99
- PayPal only
- Launch colors: Royal Purple, Black, White, Pink
