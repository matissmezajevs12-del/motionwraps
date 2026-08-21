MotionWraps — PayPal + automatic Gmail order notifications

Files:
- index.html
- api/paypal/create-order.js
- api/paypal/capture.js
- package.json

Required Vercel Environment Variables:
- PAYPAL_CLIENT_ID
- PAYPAL_CLIENT_SECRET
- GMAIL_USER
- GMAIL_APP_PASSWORD

After PayPal successfully captures a payment, capture.js automatically emails GMAIL_USER with customer, shipping, item/color, quantity, coupon, totals, PayPal order ID and capture ID.
