import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../app.js";
import {
  normalizePhone,
  validateReport,
  createCommunityStore,
  CATEGORIES,
} from "../services/community.js";
export async function withCommunity(run, store) {
  const server = createApp({ communityStore: store }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
test("normalize international phones and reject missing country codes or invalid input", () => {
  assert.equal(normalizePhone("+91 (98765) 43210"), "+919876543210");
  assert.equal(normalizePhone("+1 202-555-0123"), "+12025550123");
  for (const phone of [
    "9876543210",
    "+000",
    "+91<script>9876543210",
    {},
    null,
    "+1 12",
  ])
    assert.throws(() => normalizePhone(phone));
});
test("reports require category and consent, bound private text, strip tags and controls", () => {
  const valid = {
    phone: "+919876543210",
    category: "job",
    consent: true,
    description: "<b>fee</b>\0 requested",
  };
  assert.equal(validateReport(valid).description, "fee  requested");
  for (const input of [
    { ...valid, category: "__proto__" },
    { ...valid, category: "made-up" },
    { ...valid, consent: false },
    { ...valid, description: "x".repeat(501) },
    { ...valid, description: {} },
  ])
    assert.throws(() => validateReport(input));
});
test("unconfigured service returns 503, never an empty successful search", async () => {
  const store = createCommunityStore({ connectionString: "", abuseSecret: "" });
  await withCommunity(async (base) => {
    const r = await fetch(base + "/api/community/search?phone=%2B919876543210");
    assert.equal(r.status, 503);
    const d = await r.json();
    assert.equal(d.code, "COMMUNITY_NOT_CONFIGURED");
    assert.equal(d.total, undefined);
  }, store);
});
test("database failures return service unavailable without leaking credentials", async () => {
  const store = createCommunityStore({
    abuseSecret: "test".repeat(8),
    pool: {
      query: async () => {
        throw Error("postgres://private-password@secret");
      },
      connect: async () => {
        throw Error("private");
      },
    },
  });
  await withCommunity(async (base) => {
    for (const [path, options] of [
      ["/api/community/search?phone=%2B919876543210", {}],
      [
        "/api/community/reports",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: "+919876543210",
            category: "job",
            consent: true,
          }),
        },
      ],
    ]) {
      const r = await fetch(base + path, options);
      assert.equal(r.status, 503);
      const text = await r.text();
      assert.doesNotMatch(text, /password|postgres:|secret/);
      assert.equal(JSON.parse(text).total, undefined);
    }
  }, store);
});
test("real empty aggregate and category counts never publish private descriptions", async () => {
  let rows = [];
  const store = createCommunityStore({
    abuseSecret: "test".repeat(8),
    pool: {
      query: async (sql, parameters) => {
        assert.match(sql, /visibility='visible'/);
        assert.deepEqual(parameters, ["+919876543210"]);
        return { rows };
      },
    },
  });
  const empty = await store.search("+91 98765 43210");
  assert.equal(empty.total, 0);
  assert.equal(empty.latest, null);
  rows = [
    { category: "job", count: 2, latest: "2026-10-16T00:00:00Z" },
    { category: "payment", count: 1, latest: "2026-10-15T00:00:00Z" },
  ];
  const found = await store.search("+919876543210");
  assert.equal(found.total, 3);
  assert.equal(found.categories[0].label, CATEGORIES.job);
  assert.match(found.notice, /not independently verified/);
  assert.equal(found.description, undefined);
});

test("community malformed and oversized JSON remain validation failures", async () => {
  await withCommunity(
    async (base) => {
      for (const [body, status] of [
        ["{", 400],
        [JSON.stringify({ description: "x".repeat(70000) }), 413],
      ]) {
        const response = await fetch(base + "/api/community/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        assert.equal(response.status, status);
        assert.equal((await response.json()).status, "invalid");
      }
    },
    createCommunityStore({ connectionString: "", abuseSecret: "" }),
  );
});
