(function () {
  const DEFAULT_RE =
    /\b(apply|submit\s+application|submit\s+app|send\s+application|apply\s+now|easy\s+apply|i'?m\s+interested|submit\s+your\s+application|apply\s+for\s+this\s+job|apply\s+to\s+this\s+job)\b/i;

  let extraPhrases = [];

  function refreshExtraPhrases() {
    try {
      chrome.storage.sync.get({ extraApplyPhrases: "" }, (r) => {
        extraPhrases = String(r.extraApplyPhrases || "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
      });
    } catch {
      extraPhrases = [];
    }
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.extraApplyPhrases) {
        extraPhrases = String(changes.extraApplyPhrases.newValue || "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    });
  } catch {
    /* no storage */
  }

  refreshExtraPhrases();

  function labelMatches(labelNorm) {
    if (DEFAULT_RE.test(labelNorm)) return true;
    for (const line of extraPhrases) {
      if (line && labelNorm.includes(line.toLowerCase())) return true;
    }
    return false;
  }

  function looksLikeApplyButton(el) {
    if (!el) return false;
    const tag = el.tagName;
    const isButtonish =
      tag === "BUTTON" ||
      tag === "A" ||
      tag === "INPUT" ||
      el.getAttribute("role") === "button";
    if (!isButtonish) return false;
    if (tag === "INPUT") {
      const t = (el.getAttribute("type") || "").toLowerCase();
      if (t !== "submit" && t !== "button" && t !== "image") return false;
    }
    const label = (
      el.innerText ||
      el.textContent ||
      el.value ||
      el.getAttribute("aria-label") ||
      el.getAttribute("alt") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!label) return false;
    return labelMatches(label.toLowerCase());
  }

  function buildRecord(snapshot) {
    const now = new Date();
    const iso = now.toISOString();
    const dateStr = now.toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return {
      timestamp: iso,
      date: dateStr,
      companyName: snapshot.companyName,
      jobLink: snapshot.jobLink,
      jobSummary: snapshot.jobSummary,
      role: snapshot.role,
      pageTitle: snapshot.pageTitle || "",
    };
  }

  function collectPayload() {
    let snapshot;
    try {
      snapshot = typeof window.__BidRecordExtract === "function" ? window.__BidRecordExtract() : {};
    } catch {
      snapshot = {};
    }
    return buildRecord({
      companyName: snapshot.companyName || "(unknown company)",
      jobLink: snapshot.jobLink || location.href,
      jobSummary: snapshot.jobSummary || "(no summary)",
      role: snapshot.role || "(unknown role)",
      pageTitle: snapshot.pageTitle || document.title || "",
    });
  }

  /** Persists to the extension IndexedDB (background); always this path before any user export. */
  function persistBidToExtension() {
    const payload = collectPayload();
    try {
      chrome.runtime.sendMessage({ type: "SAVE_BID", payload });
    } catch {
      /* extension context invalidated */
    }
  }

  document.addEventListener(
    "submit",
    (ev) => {
      const sub = ev.submitter;
      if (sub && looksLikeApplyButton(sub)) {
        persistBidToExtension();
      }
    },
    true
  );

  document.addEventListener(
    "click",
    (ev) => {
      const t = ev.target;
      const el = t?.closest?.("button, a, [role='button'], input[type='submit'], input[type='button'], input[type='image']");
      if (!el || !looksLikeApplyButton(el)) return;
      persistBidToExtension();
    },
    true
  );
})();
