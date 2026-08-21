 const nodemailer = require("nodemailer");

const LIVE = "https://api-m.paypal.com";
const SANDBOX = "https://api-m.sandbox.paypal.com";

function env(name, alts = []) {
  for (const k of [name, ...alts]) {
    if (process.env[k]) return process.env[k];
  }
  return "";
}

function paypalBase() {
  const custom = env("PAYPAL_BASE_URL");
  if (custom) return custom.replace(/\/$/, "");

  return /sandbox/i.test(env("PAYPAL_MODE")) ? SANDBOX : LIVE;
}

function creds() {
  return {
    id: env("PAYPAL_CLIENT_ID"),
    secret: env("PAYPAL_CLIENT_SECRET")
  };
}

async function accessToken() {
  const { id, secret } = creds();

  if (!id || !secret) {
    throw new Error("PayPal credentials are missing.");
  }

  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("Could not get PayPal access token.");
  }

  return data.access_token;
}

function origin(req) {
  const proto = String(
    req.headers["x-forwarded-proto"] || "https"
  )
    .split(",")[0]
    .trim();

  const host = String(
    req.headers["x-forwarded-host"] || req.headers.host || ""
  )
    .split(",")[0]
    .trim();

  return `${proto}://${host}`;
}

async function sendOrderEmail(order) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPassword) {
    throw new Error("Gmail environment variables are missing.");
  }

  const purchase =
    order.purchase_units && order.purchase_units[0]
      ? order.purchase_units[0]
      : {};

  const payment =
    purchase.payments &&
    purchase.payments.captures &&
    purchase.payments.captures[0]
      ? purchase.payments.captures[0]
      : {};

  const shipping = purchase.shipping || {};
  const address = shipping.address || {};
  const payer = order.payer || {};

  const customData =
    purchase.custom_id ||
    purchase.description ||
    "Not provided";

  const amount = payment.amount || purchase.amount || {};

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPassword
    }
  });

  const emailText = `
NEW MOTIONWRAPS ORDER

Payment status: ${order.status || "UNKNOWN"}
PayPal Order ID: ${order.id || ""}
Payment ID: ${payment.id || ""}

ORDER DETAILS
Product / Color: ${customData}
Amount paid: ${amount.value || ""} ${amount.currency_code || "EUR"}

CUSTOMER
Name: ${
    payer.name
      ? `${payer.name.given_name || ""} ${payer.name.surname || ""}`
      : shipping.name
        ? shipping.name.full_name || ""
        : ""
  }
Email: ${payer.email_address || ""}

SHIPPING ADDRESS
Name: ${shipping.name ? shipping.name.full_name || "" : ""}
Address: ${address.address_line_1 || ""}
Address 2: ${address.address_line_2 || ""}
City: ${address.admin_area_2 || ""}
Region: ${address.admin_area_1 || ""}
Postal code: ${address.postal_code || ""}
Country: ${address.country_code || ""}

---
MotionWraps automatic order notification
`;

  await transporter.sendMail({
    from: `"MotionWraps Orders" <${gmailUser}>`,
    to: gmailUser,
    subject: `NEW MotionWraps Order - ${amount.value || ""} ${
      amount.currency_code || "EUR"
    }`,
    text: emailText
  });
}

module.exports = async (req, res) => {
  const base = origin(req);

  try {
    const orderId = String(req.query?.token || "");

    if (!orderId) {
      return res.redirect(302, `${base}/?payment=error`);
    }

    const token = await accessToken();

    const response = await fetch(
      `${paypalBase()}/v2/checkout/orders/${encodeURIComponent(
        orderId
      )}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const order = await response.json();

    if (!response.ok) {
      console.error("PayPal capture failed:", order);
      return res.redirect(302, `${base}/?payment=error`);
    }

    try {
      await sendOrderEmail(order);
      console.log("MotionWraps order email sent.");
    } catch (emailError) {
      console.error("Order email failed:", emailError);
    }

    return res.redirect(
      302,
      `${base}/?payment=success&order=${encodeURIComponent(order.id || orderId)}`
    );
  } catch (error) {
    console.error("Capture error:", error);
    return res.redirect(302, `${base}/?payment=error`);
  }
};
