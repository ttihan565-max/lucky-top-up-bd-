
const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const {
  VERIFY_TOKEN,
  PAGE_ACCESS_TOKEN,
  APP_SECRET,
  GEMINI_API_KEY
} = process.env;

const GRAPH_API_VERSION =
  process.env.GRAPH_API_VERSION || "v23.0";

app.get("/", (req, res) => {
  res.send("Lucky Top-Up BD AI Bot is running!");
});

// Facebook webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Verify Facebook's webhook signature
function verifySignature(req) {
  const signature = req.get("x-hub-signature-256");

  if (!signature || !APP_SECRET) return false;

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", APP_SECRET)
      .update(req.body)
      .digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  return a.length === b.length &&
    crypto.timingSafeEqual(a, b);
}

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    if (!verifySignature(req)) {
      return res.sendStatus(403);
    }

    let body;

    try {
      body = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.sendStatus(400);
    }

    if (body.object !== "page") {
      return res.sendStatus(404);
    }

    // Confirm receipt to Facebook quickly
    res.sendStatus(200);

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        handleEvent(event).catch((error) => {
          console.error("Message error:", error.message);
        });
      }
    }
  }
);

async function handleEvent(event) {
  if (!event.sender?.id || !event.message?.text) return;
  if (event.message.is_echo) return;

  const senderId = event.sender.id;
  const customerMessage = event.message.text.trim();

  if (!customerMessage) return;

  const reply = await getAIReply(customerMessage);
  await sendMessage(senderId, reply);
}

async function getAIReply(customerMessage) {
  const prompt = `
You are the official Bengali AI customer support assistant
for LUCKY TOP-UP BD.

Official website: https://luckytopupbd.com

Your duties:
- Reply politely and naturally in Bengali.
- Understand Bangla, English, and Banglish messages.
- Help customers with game top-up services and order questions.
- Mention Free Fire top-up, UID top-up, weekly/monthly
  membership, and other services only when relevant.
- For current prices, ask customers to check the official
  website. Never invent prices or claim an order is completed.
- If payment was made but balance or order is not updated,
  apologize and ask for the order ID or transaction reference.
  Explain that an admin needs to check it.
- Never claim that you have checked a payment or account
  when you have not.
- Never ask for a password, PIN, or OTP.
- If you cannot solve the issue, direct the customer to the
  official website or ask them to contact the page admin.
- Keep answers short, clear, friendly, and professional.
- Do not make up policies, delivery times, or guarantees.

Customer message:
${customerMessage}
`;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      encodeURIComponent(GEMINI_API_KEY),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: prompt }] }
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 300
        }
      })
    }
  );

  if (!response.ok) {
    console.error("Gemini error:", await response.text());
    return "দুঃখিত, এই মুহূর্তে উত্তর দিতে সমস্যা হচ্ছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন অথবা আমাদের অ্যাডমিনের সঙ্গে যোগাযোগ করুন।";
  }

  const data = await response.json();

  return (
    data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim() ||
    "দুঃখিত, আপনার প্রশ্নটি বুঝতে পারিনি। একটু বিস্তারিত লিখবেন?"
  );
}

async function sendMessage(recipientId, text) {
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages` +
    `?access_token=${encodeURIComponent(PAGE_ACCESS_TOKEN)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text: text.slice(0, 2000) }
    })
  });

  if (!response.ok) {
    console.error("Messenger API error:", await response.text());
  }
}

app.listen(PORT, () => {
  console.log(`Lucky Top-Up BD bot running on port ${PORT}`);
});
  
