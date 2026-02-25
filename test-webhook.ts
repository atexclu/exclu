const STRIPE_WEBHOOK_SECRET="whsec_mUrEGMrRGDGcQnAImiIcKXOmEXvIwQ2h";

// Mock event based on real payload you provided earlier
const payload = {
  "id": "evt_test_123",
  "object": "event",
  "api_version": "2023-10-16",
  "created": 1735759714,
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_test_mock123",
      "object": "checkout.session",
      "amount_total": 525,
      "currency": "usd",
      "payment_status": "paid",
      "metadata": {
        "creator_id": "216888f2-4767-4972-ab79-2f633869f9fc",
        "link_id": "7999269e-5658-47cc-ad42-879333f07027",
        "slug": "test-259xa6",
        "buyerEmail": ""
      }
    }
  }
};

const payloadString = JSON.stringify(payload, null, 2);

async function computeSignature(payload: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedPayload = `${timestamp}.${payload}`;

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload)
  );
  
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `t=${timestamp},v1=${signatureHex}`;
}

async function sendTest() {
  const sigResult = await computeSignature(payloadString, STRIPE_WEBHOOK_SECRET);
  console.log("Generated signature:", sigResult);
  
  try {
     const res = await fetch("http://127.0.0.1:54321/functions/v1/stripe-webhook", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": sigResult
        },
        body: payloadString
     });
     
     const text = await res.text();
     console.log("Status:", res.status);
     console.log("Response:", text);
  } catch (err) {
     console.error("Error calling local function:", err);
  }
}

sendTest();
