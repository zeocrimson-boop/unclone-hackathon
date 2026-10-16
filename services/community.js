import pg from "pg";
import { createHmac } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
export const CATEGORIES = Object.freeze({
  job: "Fake job or internship",
  upfront: "Upfront payment request",
  credentials: "OTP or banking-credential request",
  payment: "UPI or payment fraud",
  impersonation: "Impersonation",
  investment: "Suspicious investment or loan offer",
  delivery: "Delivery or customs scam",
  support: "Tech-support scam",
  threats: "Threats or coercion",
  other: "Other suspicious activity",
});
export const COMMUNITY_NOTICE =
  "Community-reported activity — not independently verified. Counts are submissions, not distinct people or proof of wrongdoing.";
export function normalizePhone(value) {
  if (
    typeof value !== "string" ||
    value.length > 35 ||
    !/^\+[\d ()-]+$/.test(value.trim())
  )
    throw new CommunityError(
      400,
      "INVALID_PHONE",
      "Enter a valid phone number beginning with + and its country code.",
    );
  const phone = parsePhoneNumberFromString(value.trim());
  if (!phone?.isValid())
    throw new CommunityError(
      400,
      "INVALID_PHONE",
      "Enter a valid phone number beginning with + and its country code.",
    );
  return phone.number;
}
export class CommunityError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function validateReport(input) {
  const phone = normalizePhone(input?.phone);
  if (!Object.hasOwn(CATEGORIES, input?.category))
    throw new CommunityError(
      400,
      "INVALID_CATEGORY",
      "Select a report category.",
    );
  if (input?.consent !== true)
    throw new CommunityError(
      400,
      "CONSENT_REQUIRED",
      "Confirm that your report is accurate to the best of your knowledge.",
    );
  if (
    input.description != null &&
    (typeof input.description !== "string" || input.description.length > 500)
  )
    throw new CommunityError(
      400,
      "INVALID_DESCRIPTION",
      "Keep the description under 500 characters.",
    );
  const description = (input.description || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  return { phone, category: input.category, description };
}
export function createCommunityStore({
  connectionString = process.env.DATABASE_URL,
  abuseSecret = process.env.REPORT_ABUSE_SECRET,
  pool: providedPool,
} = {}) {
  const pool =
    providedPool ||
    (connectionString
      ? new pg.Pool({
          connectionString,
          max: 5,
          connectionTimeoutMillis: 3000,
          query_timeout: 5000,
          statement_timeout: 5000,
        })
      : null);
  // Pool background failures must not crash the process or expose connection URLs.
  pool?.on?.("error", () => {});
  const configured = Boolean(pool && abuseSecret && abuseSecret.length >= 32);
  function requireDatabase() {
    if (!configured)
      throw new CommunityError(
        503,
        "COMMUNITY_NOT_CONFIGURED",
        "Community reporting is not yet configured. The operator must configure its database and abuse-prevention secret.",
      );
  }
  async function limitedWrite(ip, action, write) {
    requireDatabase();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Rotating pseudonymous hash; no IP addresses or user identities stored.
      const day = new Date().toISOString().slice(0, 10);
      const actor = createHmac("sha256", abuseSecret)
        .update(day + "|" + ip)
        .digest("hex");
      const key = `${action}:${actor}`;
      const { rows } = await client.query(
        `INSERT INTO abuse_windows (actor_key,window_start,attempts) VALUES ($1,date_trunc('hour',now()),1)
        ON CONFLICT (actor_key,window_start) DO UPDATE SET attempts=abuse_windows.attempts+1 RETURNING attempts`,
        [key],
      );
      if (rows[0].attempts > 5)
        throw new CommunityError(
          429,
          "REPORT_RATE_LIMIT",
          "Too many submissions. Try again in the next hour.",
        );
      const result = await write(client, actor, day);
      // Bound retention of pseudonymous abuse data; descriptions are private.
      await client.query(
        "DELETE FROM abuse_windows WHERE window_start < now() - interval '2 days'",
      );
      await client.query(
        "UPDATE reports SET actor_hash=NULL WHERE created_at < now() - interval '2 days' AND actor_hash IS NOT NULL",
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    configured,
    async search(rawPhone) {
      const phone = normalizePhone(rawPhone);
      requireDatabase();
      const { rows } = await pool.query(
        `SELECT category,count(*)::int AS count,max(created_at) AS latest FROM reports WHERE phone=$1 AND visibility='visible' GROUP BY category ORDER BY category`,
        [phone],
      );
      return {
        phone,
        total: rows.reduce((sum, row) => sum + row.count, 0),
        categories: rows.map((row) => ({
          category: row.category,
          label: CATEGORIES[row.category],
          count: row.count,
        })),
        latest: rows.length
          ? new Date(
              Math.max(...rows.map((row) => new Date(row.latest).getTime())),
            ).toISOString()
          : null,
        notice: COMMUNITY_NOTICE,
      };
    },
    async submit(input, ip) {
      const report = validateReport(input);
      return limitedWrite(ip, "report", async (client, actor, day) => {
        const { rows } = await client.query(
          `INSERT INTO reports (phone,category,description,actor_hash,report_day) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (phone,category,actor_hash,report_day) DO NOTHING RETURNING id`,
          [report.phone, report.category, report.description, actor, day],
        );
        return {
          duplicate: rows.length === 0,
          message: rows.length
            ? "Report recorded. It is an unverified community submission."
            : "A matching report from this connection was already recorded today. It has not been counted again.",
        };
      });
    },
    async flag(input, ip) {
      const phone = normalizePhone(input?.phone);
      if (!["misleading", "privacy", "other"].includes(input?.reason))
        throw new CommunityError(
          400,
          "INVALID_REASON",
          "Select a review reason.",
        );
      return limitedWrite(ip, "flag", async (client) => {
        await client.query(
          "INSERT INTO review_requests (phone,reason) VALUES ($1,$2)",
          [phone, input.reason],
        );
        return {
          message:
            "Review request recorded. The operator can review the aggregated result; no automatic removal has occurred.",
        };
      });
    },
    async close() {
      await pool?.end();
    },
  };
}
