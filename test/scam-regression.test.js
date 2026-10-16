import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTranscript, LABELS } from "../services/scam-analysis.js";
import { once } from "node:events";
import { createApp } from "../app.js";
const examples = [
  ["You won a lottery prize. Pay the fee to claim your reward.", "High"],
  ["Your job offer is guaranteed without an interview.", "Moderate"],
  [
    "Never pay a registration fee but send your OTP to confirm the offer.",
    "High",
  ],
  ["You do not need to pay registration fees before your interview.", "Low"],
  ["We never ask you to send your OTP or your password.", "Low"],
  [
    "Pay ₹999 today to secure your internship or your offer will expire.",
    "High",
  ],
  ["Send your OTP so I can access your bank account.", "High"],
  [
    "Your bank account will be blocked unless you transfer money immediately.",
    "High",
  ],
  ["We guarantee huge profits if you invest now.", "Moderate"],
  [
    "Install this remote-access app and share your screen while you open your banking app.",
    "High",
  ],
  ["Never pay upfront fees for an internship.", "Low"],
  ["This article explains why scammers ask for OTPs.", "Low"],
  [
    "Our interview is scheduled for Monday. Please bring your portfolio.",
    "Low",
  ],
  ["Hi", "Insufficient"],
  ["Please provide your UPI PIN for the refund.", "High"],
  [
    "Your SIM will be deactivated unless you click this link to verify KYC.",
    "High",
  ],
  ["Deposit money to withdraw your trading profits.", "High"],
  ["Pay the fee to claim your lottery prize.", "High"],
  ["Your parcel is held. Please pay the customs fee today.", "High"],
  ["Disable your antivirus before you install our software.", "High"],
  ["The police demand you transfer money immediately.", "High"],
  ["Please transfer money now and keep this secret.", "High"],
  ["I am stranded in an emergency, send money to this account.", "Moderate"],
  ["Pay me or I will leak your private photos.", "High"],
  [
    "Open this unexpected attachment to proceed with the interview.",
    "Moderate",
  ],
  [
    "Never share your OTP. Send your OTP so I can access your bank account.",
    "High",
  ],
  [
    "Never pay upfront fees for an internship; verify the employer independently.",
    "Low",
  ],
  ["Do not install AnyDesk. Do not share your password.", "Low"],
  [
    "Please pay your electricity bill using the provider’s official application.",
    "Low",
  ],
  [
    'I am reporting this: the scammer said "send your OTP to access your account".',
    "High",
  ],
  ["SEND YOUR OTP so we can verify your bank account!", "High"],
];
for (const [text, risk] of examples)
  test("context: " + text, () => {
    const result = analyzeTranscript(text);
    assert.equal(result.risk, risk);
    assert.equal(result.classification, LABELS[risk]);
    for (const finding of result.findings)
      assert.ok(text.includes(finding.evidence), "evidence must be verbatim");
    assert.equal(result.score, undefined);
    assert.doesNotMatch(result.classification, /\d|safe/i);
  });
test("API uses the actual qualitative engine, including too-short and failed requests", async () => {
  const server = createApp({
    textAnalyzer: (text) => {
      if (text === "force failure") throw Error("internal");
      return analyzeTranscript(text);
    },
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [text, risk] of examples.slice(0, 10)) {
      const response = await fetch(base + "/api/transcript-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).scam.classification, LABELS[risk]);
    }
    const failed = await fetch(base + "/api/transcript-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "force failure" }),
    });
    assert.equal(failed.status, 500);
    assert.equal((await failed.json()).scam, undefined);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
