const LIVE = 'https://api-m.paypal.com';
const SANDBOX = 'https://api-m.sandbox.paypal.com';

function env(name, alts=[]) {
  for (const k of [name, ...alts]) if (process.env[k]) return process.env[k];
  return '';
}
function paypalBase() {
  const custom = env('PAYPAL_BASE_URL');
  if (custom) return custom.replace(/\/$/, '');
  return /sandbox/i.test(env('PAYPAL_MODE')) ? SANDBOX : LIVE;
}
function creds() {
  return {
    id: env('PAYPAL_CLIENT_ID', ['PAYPAL_CLIENTID','NEXT_PUBLIC_PAYPAL_CLIENT_ID']),
    secret: env('PAYPAL_CLIENT_SECRET', ['PAYPAL_SECRET','PAYPAL_SECRET_KEY','PAYPAL_CLIENT_SECRET_KEY'])
  };
}
async function accessToken() {
  const {id, secret} = creds();
  if (!id || !secret) throw new Error('PayPal credentials are missing in Vercel Environment Variables.');
  const r = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error(data.error_description || 'PayPal authentication failed.');
  return data.access_token;
}

const EUROPE = new Set(['albania','andorra','austria','belarus','belgium','bosnia and herzegovina','bulgaria','croatia','cyprus','czech republic','czechia','denmark','finland','france','germany','greece','hungary','iceland','ireland','italy','kosovo','liechtenstein','luxembourg','malta','moldova','monaco','montenegro','netherlands','north macedonia','norway','poland','portugal','romania','san marino','serbia','slovakia','slovenia','spain','sweden','switzerland','turkey','ukraine','united kingdom','vatican city','holy see']);
const BALTICS = new Set(['estonia','lithuania']);
const LAUNCH = new Set(['Royal Purple','Black','White','Pink']);
function shippingFor(country) {
  const c = String(country||'').trim().toLowerCase();
  if (c === 'latvia') return 3.99;
  if (BALTICS.has(c)) return 5.99;
  if (EUROPE.has(c)) return 10.99;
  return 16.99;
}
function round(n){ return Math.round(n*100)/100; }
function origin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) throw new Error('Could not determine checkout return URL.');
  return `${proto}://${host}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body||'{}') : (req.body||{});
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return res.status(400).json({error:'Your cart is empty.'});
    let qty = 0;
    for (const item of items) {
      const q = Math.max(0, Math.min(20, Number.parseInt(item.qty,10)||0));
      if (!q) continue;
      if (item.color && !LAUNCH.has(String(item.color).trim())) return res.status(400).json({error:'One of the selected colors is not available at launch.'});
      qty += q;
    }
    if (!qty) return res.status(400).json({error:'Your cart is empty.'});
    const subtotal = round(qty * 25);
    const discount = String(body.coupon||'').trim().toUpperCase() === 'MOTION10' ? round(subtotal*0.05) : 0;
    const shipping = shippingFor(body.country);
    const total = round(subtotal - discount + shipping);
    const token = await accessToken();
    const base = origin(req);
    const orderBody = {
      intent: 'CAPTURE',
      purchase_units: [{
        description: `MotionWraps Kukirin G2 Sticker Set — ${qty} set${qty===1?'':'s'}`,
        amount: { currency_code:'EUR', value: total.toFixed(2) }
      }],
      application_context: {
        brand_name: 'MotionWraps',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        shipping_preference: 'GET_FROM_FILE',
        return_url: `${base}/api/paypal/capture`,
        cancel_url: `${base}/?payment=cancelled`
      }
    };
    const r = await fetch(`${paypalBase()}/v2/checkout/orders`, {
      method:'POST',
      headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json', 'PayPal-Request-Id':`mw-${Date.now()}-${Math.random().toString(36).slice(2)}` },
      body:JSON.stringify(orderBody)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.details?.[0]?.description || data?.message || 'PayPal could not create the order.');
    const approvalUrl = data.links?.find(x=>x.rel==='approve')?.href;
    if (!approvalUrl) throw new Error('PayPal approval link was not returned.');
    res.status(200).json({approvalUrl, orderId:data.id, totals:{subtotal,discount,shipping,total}});
  } catch (e) {
    console.error(e);
    res.status(500).json({error:e.message || 'Checkout error.'});
  }
};
