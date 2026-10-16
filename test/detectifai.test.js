import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeVoice, OFFICIAL_ENDPOINT } from "../services/detectifai.js";
const audio = {
  buffer: Buffer.from("fixture only"),
  originalname: "call.wav",
  mimetype: "audio/wav",
};
function payload(verdict = "real") {
  return {
    object: "deepfake.detection",
    request_id: "req_fixture",
    result: {
      verdict,
      duration_seconds: 8,
      segments: [{ start: 0, end: 4, score: 0.1 }],
    },
  };
}
for (const verdict of ["real", "fake", "not_sure"])
  test("documented provider verdict: " + verdict, async () => {
    const result = await analyzeVoice(audio, {
      apiKey: "test-only",
      idempotencyKey: "test-retry",
      fetchImpl: async (url, options) => {
        assert.equal(url, OFFICIAL_ENDPOINT);
        assert.equal(options.method, "POST");
        assert.equal(options.redirect, "error");
        assert.equal(options.headers.Authorization, "Bearer test-only");
        assert.equal(options.headers["Idempotency-Key"], "test-retry");
        assert.deepEqual([...options.body.keys()], ["file"]);
        assert.equal(options.body.get("file").size, audio.buffer.length);
        return Response.json(payload(verdict));
      },
    });
    assert.equal(result.verdict, verdict);
    assert.equal(
      result.status,
      verdict === "not_sure" ? "inconclusive" : "success",
    );
  });
test("missing key and untrusted endpoint cannot send audio or secrets", async () => {
  const fetchImpl = () => {
    throw Error("must not fetch");
  };
  for (const options of [
    { apiKey: "" },
    { apiKey: "test-only", url: "https://evil.example/v1/deepfake/detect" },
  ])
    assert.equal(
      (await analyzeVoice(audio, { ...options, fetchImpl })).status,
      "unavailable",
    );
});
for (const malformed of [
  {},
  { result: { score: 0 } },
  payload("unknown"),
  {
    ...payload(),
    result: {
      ...payload().result,
      segments: [{ start: 4, end: 2, score: 0.1 }],
    },
  },
])
  test(
    "invalid schema never becomes a successful voice verdict " +
      JSON.stringify(malformed),
    async () => {
      const result = await analyzeVoice(audio, {
        apiKey: "test-only",
        fetchImpl: async () => Response.json(malformed),
      });
      assert.equal(result.status, "error");
    },
  );
for (const status of [401, 403, 402, 422, 429, 503])
  test("provider HTTP " + status + " is an error", async () => {
    try {
      const result = await analyzeVoice(audio, {
        apiKey: "test-only",
        fetchImpl: async () =>
          new Response("private upstream details", { status }),
      });
      assert.equal(result.status, "error");
      assert.doesNotMatch(JSON.stringify(result), /private upstream/);
    } catch (error) {
      assert.ok([401, 403].includes(error.status));
    }
  });

test("provider transport sends real multipart bytes, not a stringified FormData object", async () => {
  const { createServer } = await import("node:http");
  const { once } = await import("node:events");
  const { fetch: transport } = await import("undici");
  let received = "";
  let contentType = "";
  const server = createServer((req, res) => {
    contentType = req.headers["content-type"];
    req.on("data", (chunk) => (received += chunk.toString()));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(payload()));
    });
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const result = await analyzeVoice(audio, {
      apiKey: "local-test-only",
      fetchImpl: (_url, options) =>
        transport(`http://127.0.0.1:${server.address().port}`, {
          ...options,
          dispatcher: undefined,
        }),
    });
    assert.equal(result.status, "success");
    assert.match(contentType, /multipart\/form-data; boundary=/);
    assert.match(received, /name="file"/);
    assert.match(received, /fixture only/);
    assert.doesNotMatch(received, /\[object FormData\]/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
