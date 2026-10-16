// Public community UI. All validation, normalization and storage happen server-side.
(() => {
  const byId = (id) => document.getElementById(id);
  let searchedPhone = null;
  async function api(url, body) {
    const response = await fetch(url, {
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.message || "Community service is currently unavailable.",
      );
    return data;
  }
  function failure(error) {
    return error.name === "TimeoutError"
      ? "Community request timed out. No result is available."
      : error instanceof TypeError
        ? "Cannot reach the community service. No result is available."
        : error.message;
  }
  function bind(id, label, handler, feedback) {
    byId(id).addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button[type=submit]");
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = "Processing…";
      feedback.textContent = "";
      try {
        await handler();
      } catch (error) {
        feedback.textContent = failure(error);
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    });
  }
  api("/api/health")
    .then((data) => {
      byId("voice-status").textContent =
        data.voice === "configured"
          ? "DetectifAI configured · account access checked on analysis"
          : "DetectifAI credentials not configured";
      byId("community-status").textContent =
        data.community === "configured"
          ? "Database configured · availability checked on request"
          : "Community reporting not yet configured";
    })
    .catch(() => {
      byId("community-status").textContent = "Service status unavailable";
      byId("voice-status").textContent = "Service status unavailable";
    });
  api("/api/community/categories")
    .then((data) => {
      for (const [key, label] of Object.entries(data.categories)) {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = label;
        byId("report-category").append(option);
      }
    })
    .catch(() => {
      byId("report-feedback").textContent =
        "Report categories could not be loaded. Refresh to try again.";
    });
  bind(
    "phone-search",
    "Search reports",
    async () => {
      searchedPhone = null;
      byId("review-form").hidden = true;
      const data = await api(
        "/api/community/search?phone=" +
          encodeURIComponent(byId("search-phone").value),
      );
      searchedPhone = data.phone;
      const box = byId("phone-result");
      box.replaceChildren();
      const heading = document.createElement("h4");
      heading.textContent = data.phone;
      box.append(heading);
      const summary = document.createElement("p");
      summary.textContent = data.total
        ? `${data.total} community report submission${data.total === 1 ? "" : "s"}.`
        : "No community reports were found. This does not mean the number is safe.";
      box.append(summary);
      for (const category of data.categories) {
        const p = document.createElement("p");
        p.textContent = `${category.label}: ${category.count}`;
        box.append(p);
      }
      if (data.latest) {
        const p = document.createElement("p");
        p.textContent =
          "Most recent report: " + new Date(data.latest).toLocaleDateString();
        box.append(p);
      }
      const notice = document.createElement("p");
      notice.textContent = data.notice;
      box.append(notice);
      byId("review-form").hidden = false;
      byId("review-feedback").textContent = "";
    },
    byId("phone-result"),
  );
  bind(
    "phone-report",
    "Submit community report",
    async () => {
      const data = await api("/api/community/reports", {
        phone: byId("report-phone").value,
        category: byId("report-category").value,
        description: byId("report-description").value,
        consent: byId("report-consent").checked,
      });
      byId("report-feedback").textContent = data.message;
      if (!data.duplicate) {
        byId("report-description").value = "";
        byId("report-consent").checked = false;
      }
    },
    byId("report-feedback"),
  );
  bind(
    "review-form",
    "Request review",
    async () => {
      const data = await api("/api/community/review", {
        phone: searchedPhone,
        reason: byId("review-reason").value,
      });
      byId("review-feedback").textContent = data.message;
    },
    byId("review-feedback"),
  );
})();
