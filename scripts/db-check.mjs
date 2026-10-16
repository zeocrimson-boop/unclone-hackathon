// Isolated PostgreSQL integration check. Creates and drops only a fresh test schema.
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createApp } from "../app.js";
import { createCommunityStore } from "../services/community.js";
import { chromium } from "playwright";
if (!process.env.TEST_DATABASE_URL)
  throw Error(
    "Set TEST_DATABASE_URL to a disposable PostgreSQL database. This check is explicit, not skipped.",
  );
const admin = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
const schema = "echoguard_test_" + randomUUID().replaceAll("-", "");
await admin.connect();
let store, server, browser;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  const connectionString = url.toString();
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ["scripts/migrate.js"], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: connectionString },
    });
    assert.equal(result.status, 0, result.stderr); // Verify repeatable, non-destructive migration.
  }
  store = createCommunityStore({
    connectionString,
    abuseSecret: "isolated-test-secret-".repeat(3),
  });
  server = createApp({ communityStore: store }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const phone = "+12025550123";
  const search = async () => {
    const r = await fetch(
      base + "/api/community/search?phone=" + encodeURIComponent(phone),
    );
    assert.equal(r.status, 200);
    return r.json();
  };
  assert.equal((await search()).total, 0);
  const submit = async (category = "job") =>
    fetch(base + "/api/community/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        category,
        consent: true,
        description: "<script>private fixture</script>",
      }),
    });
  assert.equal((await submit()).status, 201);
  const duplicate = await submit();
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal((await submit("payment")).status, 201);
  let found = await search();
  assert.equal(found.total, 2);
  assert.equal(found.categories.length, 2);
  assert.doesNotMatch(JSON.stringify(found), /fixture|description|actor_hash/);
  const rows = await admin.query(
    `SELECT description,actor_hash FROM ${schema}.reports`,
  );
  assert.equal(rows.rows[0].description, "private fixture");
  assert.match(rows.rows[0].actor_hash, /^[a-f0-9]{64}$/);
  // New application + connection pool must see data from earlier requests.
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await store.close();
  store = createCommunityStore({
    connectionString,
    abuseSecret: "isolated-test-secret-".repeat(3),
  });
  server = createApp({ communityStore: store }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const restarted = `http://127.0.0.1:${server.address().port}`;
  const persisted = await fetch(
    restarted + "/api/community/search?phone=" + encodeURIComponent(phone),
  );
  assert.equal((await persisted.json()).total, 2);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : {}),
    args: process.env.CI ? ["--no-sandbox"] : [],
  });
  const page = await browser.newPage();
  await page.goto(restarted);
  await page.locator("#search-phone").fill(phone);
  await page.locator("#phone-search button").click();
  await page
    .getByText("2 community report submissions.", { exact: true })
    .waitFor();
  await page.locator("#review-form button").click();
  await page.getByText(/Review request recorded/).waitFor();
  assert.equal(
    (
      await admin.query(
        `SELECT count(*)::int AS count FROM ${schema}.review_requests`,
      )
    ).rows[0].count,
    1,
  );
  // Third unique report through the actual browser form; existing duplicate took
  // one attempt, so two attempts remain before the shared hourly cap.
  await page.locator("#report-phone").fill(phone);
  await page.locator("#report-category").selectOption("support");
  await page.locator("#report-consent").check();
  await page.locator("#phone-report button").click();
  await page.getByText(/Report recorded\./).waitFor();
  const post = (category) =>
    fetch(restarted + "/api/community/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, category, consent: true }),
    });
  assert.equal((await post("threats")).status, 201);
  assert.equal((await post("other")).status, 429);
  // Moderator hiding affects the actual aggregate.
  await admin.query(
    `UPDATE ${schema}.reports SET visibility='hidden' WHERE category='job'`,
  );
  const visible = await fetch(
    restarted + "/api/community/search?phone=" + encodeURIComponent(phone),
  );
  assert.equal((await visible.json()).total, 3);
  console.log(
    "PASS: real PostgreSQL migrations twice, empty search, normalization, submission, duplicate prevention, category aggregation, private text, reconnection persistence, browser search/report/review, persistent rate cap and moderation visibility.",
  );
} finally {
  await browser?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await store?.close();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
