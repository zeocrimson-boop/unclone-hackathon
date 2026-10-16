import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../app.js";
import { analyzeTranscript, rules } from "../services/scam-analysis.js";
import { analyzeVoice, UNCONFIGURED_MESSAGE } from "../services/detectifai.js";
import { validateTranscript, MAX_AUDIO_BYTES } from "../services/validation.js";

async function withServer(run, options) {
  const server = createApp(options).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
function wav() {
  // Valid PCM WAV with 0.1 seconds of silence, generated in memory for validation.
  const b = Buffer.alloc(3244);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(3200, 40);
  return b;
}
function upload(buffer = wav(), name = "call.wav", type = "audio/wav") {
  const data = new FormData();
  data.append("audio", new Blob([buffer], { type }), name);
  return data;
}
const cases = [
  [
    "ordinary conversation",
    "Our interview is scheduled for Monday. Please bring your portfolio.",
    "Low",
    [],
  ],
  [
    "upfront fees",
    "Please pay a registration fee before your internship starts.",
    "Moderate",
    ["fees"],
  ],
  [
    "OTP request",
    "Please share your OTP with the recruiter.",
    "High",
    ["credentials"],
  ],
  [
    "banking credentials",
    "Provide your banking credentials to finish onboarding.",
    "High",
    ["credentials"],
  ],
  [
    "urgent payment",
    "Transfer the money immediately. Your offer expires in five minutes.",
    "High",
    ["pressure", "expiry"],
  ],
  [
    "unusual payment and guarantee",
    "You have guaranteed selection. Send bitcoin to our wallet now.",
    "High",
    ["payment", "pressure", "guarantee"],
  ],
  [
    "remote software",
    "Install AnyDesk for the interview.",
    "Moderate",
    ["software"],
  ],
  [
    "unverified link",
    "Visit https://bit.ly/recruiter",
    "Insufficient",
    ["links"],
  ],
  [
    "protective advice",
    "Never share your OTP. Do not pay a registration fee. No internship fee is required.",
    "Low",
    [],
  ],
];
for (const [name, text, risk, ids] of cases)
  test(`rules: ${name}`, () => {
    const result = analyzeTranscript(text);
    assert.equal(result.risk, risk);
    assert.deepEqual(result.findings.map((f) => f.id).sort(), ids.sort());
    for (const finding of result.findings)
      assert.ok(text.includes(finding.evidence));
    assert.equal(result.transcript, text);
    assert.equal(result.status, "success");
  });
test("repeated phrases do not inflate the score", () => {
  const result = analyzeTranscript(
    "Share your OTP. Share your OTP. Share your OTP.",
  );
  assert.equal(result.score, undefined);
  assert.equal(result.findings.length, 1);
});
test("link evidence preserves the entire supplied URL", () => {
  const url = "https://bit.ly/recruiter";
  assert.ok(
    analyzeTranscript(`Visit ${url}`).findings[0].evidence.includes(url),
  );
});
test("empty, non-string and oversized transcript validation", () => {
  for (const input of ["", "  ", null, {}, "x".repeat(12001)])
    assert.ok(validateTranscript(input));
  assert.equal(validateTranscript("Monday interview"), null);
});
test("health endpoint and security headers", async () =>
  withServer(async (base) => {
    const r = await fetch(`${base}/api/health`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).transcriptAnalysis, "available");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.ok(r.headers.get("content-security-policy"));
    assert.equal(r.headers.get("x-powered-by"), null);
  }));
test("transcript route rejects empty input and keeps voice separate", async () =>
  withServer(async (base) => {
    for (const transcript of ["", {}, "x".repeat(12001)]) {
      const r = await fetch(`${base}/api/transcript-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      assert.equal(r.status, 400);
    }
    const r = await fetch(`${base}/api/transcript-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "Share your OTP." }),
    });
    const d = await r.json();
    assert.equal(d.scam.risk, "High");
    assert.equal(d.voice.status, "unavailable");
    assert.equal(d.voice.score, undefined);
  }));
test("valid audio accepted, but no voice analysis or transcription invented", async () =>
  withServer(async (base) => {
    const valid = await fetch(`${base}/api/audio/upload`, {
      method: "POST",
      body: upload(),
    });
    assert.equal(valid.status, 200);
    const r = await fetch(`${base}/api/voice-detection`, {
      method: "POST",
      body: upload(),
    });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.status, "unavailable");
    assert.equal(d.voice.message, UNCONFIGURED_MESSAGE);
    assert.equal(d.scam.status, "unavailable");
    assert.equal(d.transcription, undefined);
    assert.equal(d.voice.score, undefined);
  }));
test("provider is unavailable without configured credentials", async () => {
  assert.equal((await analyzeVoice({})).status, "unavailable");
});
test("reject missing, disguised, unsupported, empty and multiple uploads", async () =>
  withServer(async (base) => {
    const multiple = upload();
    multiple.append(
      "audio",
      new Blob([wav()], { type: "audio/wav" }),
      "second.wav",
    );
    for (const body of [
      new FormData(),
      upload(Buffer.from("not audio")),
      upload(wav(), "file.exe"),
      upload(Buffer.alloc(0)),
      multiple,
    ]) {
      const r = await fetch(`${base}/api/voice-detection`, {
        method: "POST",
        body,
      });
      assert.equal(r.status, 400);
    }
  }));
test("oversized audio is rejected by multipart parser", async () =>
  withServer(async (base) => {
    const r = await fetch(`${base}/api/voice-detection`, {
      method: "POST",
      body: upload(Buffer.alloc(MAX_AUDIO_BYTES + 1)),
    });
    assert.equal(r.status, 413);
    assert.match((await r.json()).message, /10 MB/);
  }));
for (const [name, error, code] of [
  [
    "authentication",
    Object.assign(new Error("private-key-do-not-leak"), { status: 401 }),
    "PROVIDER_AUTHENTICATION",
  ],
  [
    "network",
    new TypeError("internal-url-do-not-leak"),
    "PROVIDER_UNAVAILABLE",
  ],
  [
    "timeout",
    Object.assign(new Error("private"), { name: "TimeoutError" }),
    "PROVIDER_TIMEOUT",
  ],
])
  test(`injected provider ${name} failure is safe and clears audio memory`, async () => {
    let captured;
    await withServer(
      async (base) => {
        const r = await fetch(`${base}/api/voice-detection`, {
          method: "POST",
          body: upload(),
        });
        assert.equal(r.status, 502);
        const text = await r.text();
        const d = JSON.parse(text);
        assert.equal(d.voice.code, code);
        assert.equal(d.scam.status, "unavailable");
        assert.doesNotMatch(text, /do-not-leak/);
        assert.ok(captured.every((b) => b === 0));
      },
      {
        voiceAnalyzer: async (file) => {
          captured = file.buffer;
          throw error;
        },
      },
    );
  });
test("malformed JSON and unknown routes have safe errors", async () =>
  withServer(async (base) => {
    const r = await fetch(`${base}/api/transcript-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).status, "invalid");
    assert.equal((await fetch(`${base}/not-a-route`)).status, 404);
  }));
test("rate limit rejects excess requests without contents", async () =>
  withServer(async (base) => {
    for (let i = 0; i < 20; i++)
      await fetch(`${base}/api/transcript-analysis`, { method: "POST" });
    const r = await fetch(`${base}/api/transcript-analysis`, {
      method: "POST",
    });
    assert.equal(r.status, 429);
    assert.equal((await r.json()).code, "RATE_LIMIT");
  }));
