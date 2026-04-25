(function () {
  const MAX_SUMMARY_LEN = 200;

  function stripHtml(html) {
    if (!html || typeof html !== "string") return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.innerText || tmp.textContent || "").replace(/\s+/g, " ").trim();
  }

  function normalizeText(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function takeSnippet(s, maxLen = MAX_SUMMARY_LEN) {
    const t = normalizeText(s);
    if (!t) return "";
    if (t.length <= maxLen) return t;
    return t.slice(0, maxLen - 1) + "…";
  }

  function pickOgTitle() {
    const m =
      document.querySelector('meta[property="og:title"]') ||
      document.querySelector('meta[name="twitter:title"]');
    return m?.getAttribute("content")?.trim() || "";
  }

  function pickDescriptionSnippet() {
    const m =
      document.querySelector('meta[property="og:description"]') ||
      document.querySelector('meta[name="description"]') ||
      document.querySelector('meta[name="twitter:description"]');
    const raw = m?.getAttribute("content")?.replace(/\s+/g, " ").trim() || "";
    if (raw.length <= MAX_SUMMARY_LEN) return raw;
    return raw.slice(0, MAX_SUMMARY_LEN - 1) + "…";
  }

  function guessRoleFromTitle(title) {
    if (!title) return "";
    const t = title.replace(/\s+/g, " ").trim();
    const at = t.match(/\s+at\s+/i);
    if (at && at.index > 0) return t.slice(0, at.index).trim();
    const pipe = t.split("|");
    if (pipe.length > 1) return pipe[0].trim();
    return t;
  }

  function guessCompanyFromTitle(title) {
    if (!title) return "";
    const m = title.match(/\s+at\s+(.+)$/i);
    if (m) return m[1].trim();
    const pipe = title.split("|");
    if (pipe.length > 1) return pipe[pipe.length - 1].trim();
    return "";
  }

  function inferMainStack(jobText, title) {
    const blob = `${jobText} ${title}`.toLowerCase();
    const keys = [
      // Frontend
      "react",
      "next.js",
      "nextjs",
      "vue",
      "nuxt",
      "angular",
      "svelte",
      "tailwind",
      // Backend
      "node",
      "node.js",
      "express",
      "nestjs",
      "python",
      "fastapi",
      "django",
      "flask",
      "java",
      "spring",
      "kotlin",
      "swift",
      "go",
      "rust",
      ".net",
      "c#",
      "asp.net",
      "php",
      "ruby",
      "rails",
      // Data
      "postgres",
      "postgresql",
      "mysql",
      "mongodb",
      "redis",
      "elasticsearch",
      "kafka",
      // Cloud/DevOps
      "aws",
      "gcp",
      "azure",
      "kubernetes",
      "docker",
      "terraform",
      "ansible",
      "ci/cd",
      // Language/tooling
      "typescript",
      "javascript",
      "graphql",
      "rest",
    ];
    const found = [];
    for (const k of keys) {
      if (blob.includes(k)) found.push(k);
    }
    return [...new Set(found)].slice(0, 6).join(", ");
  }

  function extractJobDescriptionText() {
    // Common job description containers across ATS/boards
    const selectors = [
      "[data-testid*='jobDescription']",
      "[data-testid*='job-description']",
      "[class*='jobDescription']",
      "[class*='job-description']",
      "#jobDescriptionText",
      ".jobsearch-jobDescriptionText",
      ".jobs-description__content",
      ".jobs-box__html-content",
      ".description__text",
      "article",
      "[role='main']",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const t = takeSnippet(el?.innerText || "", 4000);
      if (t && t.length >= 200) return t;
    }

    // Fallback: pick the largest text block among a few likely containers
    const candidates = Array.from(
      document.querySelectorAll("main, article, section, div")
    ).slice(0, 2000);

    let best = "";
    for (const el of candidates) {
      const t = normalizeText(el.innerText || "");
      if (t.length > best.length) best = t;
    }
    if (best.length >= 200) return best.slice(0, 4000);
    return "";
  }

  function flattenJsonLd(node, out) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((n) => flattenJsonLd(n, out));
      return;
    }
    if (typeof node !== "object") return;
    if (node["@graph"]) flattenJsonLd(node["@graph"], out);
    const t = node["@type"];
    const types = Array.isArray(t) ? t : t ? [t] : [];
    if (types.includes("JobPosting")) out.push(node);
  }

  function parseJobPostingBlocks() {
    const out = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      let data;
      try {
        data = JSON.parse(s.textContent || "");
      } catch {
        return;
      }
      flattenJsonLd(data, out);
    });
    return out;
  }

  function fromJobPosting(jp) {
    const title = typeof jp.title === "string" ? jp.title.trim() : "";
    let company = "";
    const org = jp.hiringOrganization;
    if (typeof org === "string") company = org.trim();
    else if (org && typeof org === "object" && typeof org.name === "string") company = org.name.trim();
    let desc = "";
    if (typeof jp.description === "string") desc = stripHtml(jp.description);
    // Prefer JSON-LD description, but if the page has a real description block, use it for stack detection.
    const domDesc = extractJobDescriptionText();
    const stackSource = domDesc || desc;
    const descSnippet = takeSnippet(desc, MAX_SUMMARY_LEN);
    const url = typeof jp.url === "string" && jp.url.startsWith("http") ? jp.url : location.href;
    const mainStack = inferMainStack(stackSource, title) || takeSnippet(stackSource, 80);
    return {
      jobLink: url,
      companyName: company || guessCompanyFromTitle(title) || "(unknown company)",
      role: title || guessRoleFromTitle(document.title) || "(unknown role)",
      jobSummary: mainStack || takeSnippet(stackSource, 80) || descSnippet || "(no summary)",
      pageTitle: title || document.title || "",
    };
  }

  function byHostname() {
    const h = location.hostname.replace(/^www\./, "");
    if (h.includes("linkedin.com")) {
      const t =
        document.querySelector(".jobs-unified-top-card__job-title") ||
        document.querySelector("h1.t-24") ||
        document.querySelector(".job-details-jobs-unified-top-card__job-title");
      const c =
        document.querySelector(".jobs-unified-top-card__company-name a") ||
        document.querySelector(".job-details-jobs-unified-top-card__company-name a");
      const title = (t && (t.innerText || "").trim()) || "";
      const company = (c && (c.innerText || "").trim()) || "";
      if (title || company) {
        const descText = extractJobDescriptionText();
        const summary = takeSnippet(descText || pickDescriptionSnippet(), MAX_SUMMARY_LEN);
        const mainStack = inferMainStack(descText || summary, title) || takeSnippet(descText || summary, 80);
        return {
          jobLink: location.href,
          companyName: company || guessCompanyFromTitle(document.title) || "(unknown company)",
          role: title || guessRoleFromTitle(document.title) || "(unknown role)",
          jobSummary: mainStack || takeSnippet(descText || summary, 80) || "(no summary)",
          pageTitle: title || document.title || "",
        };
      }
    }
    if (h.includes("indeed.com")) {
      const t =
        document.querySelector('[data-testid="simpler-jobTitle"]') ||
        document.querySelector(".jobsearch-JobInfoHeader-title") ||
        document.querySelector("h1");
      const c =
        document.querySelector('[data-testid="inlineHeader-companyName"]') ||
        document.querySelector('[data-testid="company-name"]') ||
        document.querySelector(".jobsearch-InlineCompanyRating a");
      const title = (t && (t.innerText || "").trim()) || "";
      const company = (c && (c.innerText || "").trim()) || "";
      if (title || company) {
        const descText = extractJobDescriptionText();
        const summary = takeSnippet(descText || pickDescriptionSnippet(), MAX_SUMMARY_LEN);
        const mainStack = inferMainStack(descText || summary, title) || takeSnippet(descText || summary, 80);
        return {
          jobLink: location.href,
          companyName: company || "(unknown company)",
          role: title || "(unknown role)",
          jobSummary: mainStack || takeSnippet(descText || summary, 80) || "(no summary)",
          pageTitle: title || document.title || "",
        };
      }
    }
    return null;
  }

  window.__BidRecordExtract = function extractBidSnapshot() {
    const jpList = parseJobPostingBlocks();
    if (jpList.length) {
      return fromJobPosting(jpList[0]);
    }
    const host = byHostname();
    if (host) return host;

    const ogTitle = pickOgTitle();
    const docTitle = document.title?.replace(/\s+/g, " ").trim() || "";
    const title = ogTitle || docTitle;
    const descText = extractJobDescriptionText();
    const summary = takeSnippet(descText || pickDescriptionSnippet(), MAX_SUMMARY_LEN);
    const company = guessCompanyFromTitle(title);
    const role = guessRoleFromTitle(title);
    const mainStack = inferMainStack(descText || summary, title) || takeSnippet(descText || summary, 80);

    return {
      jobLink: location.href,
      companyName: company || "(unknown company)",
      role: role || "(unknown role)",
      jobSummary: mainStack || takeSnippet(descText || summary, 80) || "(no summary)",
      pageTitle: title,
    };
  };
})();
