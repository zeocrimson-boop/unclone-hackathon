// Optional real-browser checks. Run npm run test:browser after installing Chromium.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../app.js";

const server = createApp().listen(0, "127.0.0.1");
await once(server, "listening");
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : {}),
    args: process.env.CI ? ["--no-sandbox"] : [],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator("#analyze-transcript").click();
  assert.match(
    await page.locator("#transcript-error").textContent(),
    /Paste text/,
  );
  const text =
    "Pay a registration fee immediately. Share your OTP to confirm your internship. <script>alert(1)</script>";
  await page.locator("#transcript").fill(text);
  await page.locator("#analyze-transcript").click();
  await page.locator("#report-content").waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#risk-value").textContent(),
    "Likely a scam",
  );
  assert.equal(
    await page.locator("#voice-value").textContent(),
    "Not assessed",
  );
  assert.ok(
    (await page.locator("#findings").textContent()).includes("Share your OTP"),
  );
  assert.equal(await page.locator("#submitted-transcript").textContent(), text);
  assert.equal(await page.locator("#submitted-transcript script").count(), 0);
  await page.locator("#audio-file").setInputFiles({
    name: "invalid.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not audio"),
  });
  assert.match(
    await page.locator("#audio-error").textContent(),
    /WAV, MP3, or M4A/,
  );
  const wav = Buffer.alloc(3244);
  wav.write("RIFF");
  wav.writeUInt32LE(3236, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(3200, 40);
  await page.locator("#audio-file").setInputFiles({
    name: "authorized-test.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });
  assert.equal(
    await page.locator("#file-name").textContent(),
    "authorized-test.wav",
  );
  await page.locator("#analyze-audio").click();
  await page.locator("#voice-feedback").waitFor({ state: "visible" });
  assert.match(
    await page.locator("#voice-feedback").textContent(),
    /Voice detection is not configured yet/,
  );
  assert.equal(await page.locator("#voice-value").textContent(), "Unavailable");
  assert.equal(
    await page.locator("#risk-value").textContent(),
    "Likely a scam",
  );
  await page.locator("#search-phone").fill("+12025550123");
  await page.locator("#phone-search button").click();
  await page.getByText(/Community reporting is not yet configured\./).waitFor();
  assert.doesNotMatch(
    await page.locator("#phone-result").textContent(),
    /No community reports were found/,
  );
  // Exercise every qualitative frontend state using the actual text endpoint.
  for (const [text, label] of [
    [
      "Our interview is scheduled for Monday. Please bring your portfolio.",
      "Mostly not a scam based on the text provided",
    ],
    ["Hi", "Not enough information"],
    ["Send your OTP so I can access your bank account.", "Likely a scam"],
  ]) {
    await page.locator("#transcript").fill(text);
    await page.locator("#analyze-transcript").click();
    await page.getByText(label, { exact: true }).waitFor();
  }
  // Provider fixtures test UI mapping only, never a claim of a real API result.
  for (const [status, verdict, label] of [
    ["success", "fake", "Synthetic indications found"],
    ["success", "real", "No strong synthetic indication"],
    ["inconclusive", "not_sure", "Inconclusive"],
  ]) {
    await page.route("**/api/voice-detection", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status,
          voice: { status, verdict, message: "Isolated browser fixture" },
        }),
      }),
    );
    await page.locator("#analyze-audio").click();
    await page.getByText(label, { exact: true }).waitFor();
    assert.equal(
      await page.locator("#risk-value").textContent(),
      "Likely a scam",
    );
    await page.unroute("**/api/voice-detection");
  }
  await page.locator("#analyze-audio").click();
  await page.getByText("Unavailable", { exact: true }).waitFor();
  // Failed text requests must clear an older completed text result while
  // preserving the independently obtained voice result.
  await page.route("**/api/transcript-analysis", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        status: "error",
        message: "Analysis failed. Please retry.",
      }),
    }),
  );
  await page
    .locator("#transcript")
    .fill("A new message that cannot currently be analyzed.");
  await page.locator("#analyze-transcript").click();
  await page
    .getByText("Analysis failed. Please retry.", { exact: true })
    .waitFor();
  assert.equal(await page.locator("#risk-value").textContent(), "Not assessed");
  assert.equal(await page.locator("#voice-value").textContent(), "Unavailable");
  await page.unroute("**/api/transcript-analysis");
  await page
    .locator("#transcript")
    .fill("We guarantee huge profits if you invest now.");
  await page.locator("#analyze-transcript").click();
  await page.getByText("Suspicious — verify first", { exact: true }).waitFor();
  // Mobile overflow, real results, and reduced-motion accessibility.
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `overflow at ${width}px`,
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    audit.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    [],
  );
  await page.screenshot({ path: "/tmp/echoguard-desktop.png", fullPage: true });
  await page.locator("#start-over").click();
  assert.equal(await page.locator("#empty-report").isVisible(), true);
  assert.equal(await page.locator("#transcript").inputValue(), "");
  assert.equal(await page.locator("#file-drop").isVisible(), true);
  const initialAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    initialAudit.violations.map((v) => v.id),
    [],
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: all qualitative text labels, evidence/XSS rendering, failed analysis clears stale text, audio validation, fixture voice verdict mapping, independent results, unavailable database, reset, four viewport widths and two automated accessibility scans.",
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
