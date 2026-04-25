const statusEl = document.getElementById("status");
const rowsEl = document.getElementById("rows");
const emptyEl = document.getElementById("empty");
const tableWrapEl = document.getElementById("tableWrap");
const exportBtn = document.getElementById("export");
const clearBtn = document.getElementById("clear");
const pagerEl = document.getElementById("pager");
const prevBtn = document.getElementById("prevPage");
const nextBtn = document.getElementById("nextPage");
const pageInfoEl = document.getElementById("pageInfo");
const pageSizeEl = document.getElementById("pageSize");
const sortTimestampBtn = document.getElementById("sortTimestamp");
const sortIndEl = document.getElementById("sortInd");

let pageSize = Number(pageSizeEl?.value || 50) || 50;
let currentPage = 1; // 1-based
let totalCount = 0;
let sortDirection = "desc"; // only Timestamp sorting: desc=newest first, asc=oldest first

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? "");
  // Local time, easy to scan: YYYY-MM-DD HH:mm:ss
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function setStatus(msg, isErr) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("err", !!isErr);
}

function escapeXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellXml(value) {
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function rowXml(cells) {
  return `<Row>${cells.map(cellXml).join("")}</Row>`;
}

/** Excel 2003 XML (SpreadsheetML); opens in Excel as .xls. Built only from DB-backed rows. */
function rowsToExcelXml(rows) {
  const headers = [
    "Number",
    "Date",
    "Timestamp (bid time)",
    "Company name",
    "Job description link",
    "Job summary (main stack)",
    "Role",
  ];
  const body = [];
  body.push(rowXml(headers));
  rows.forEach((r, i) => {
    body.push(
      rowXml([
        String(i + 1),
        r.date,
        formatTimestamp(r.timestamp),
        r.companyName,
        r.jobLink,
        r.jobSummary,
        r.role,
      ])
    );
  });
  return (
    '<?xml version="1.0"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:html="http://www.w3.org/TR/REC-html40">\n' +
    '<Worksheet ss:Name="BidHistory"><Table>\n' +
    body.join("\n") +
    "\n</Table></Worksheet>\n</Workbook>"
  );
}

function downloadExcel(filename, xml) {
  const blob = new Blob([xml], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function cleanCellText(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

async function saveField(id, field, value, el) {
  el.classList.remove("err");
  el.classList.add("saving");
  const changes = { [field]: value };
  const resp = await chrome.runtime.sendMessage({ type: "UPDATE_BID", id, changes });
  el.classList.remove("saving");
  if (!resp?.ok) {
    el.classList.add("err");
    setStatus(resp?.error || "Save failed", true);
    return false;
  }
  setStatus("Saved.");
  return true;
}

function setEmptyState(isEmpty) {
  emptyEl.classList.toggle("hidden", !isEmpty);
  tableWrapEl.classList.toggle("hidden", isEmpty);
  exportBtn.disabled = isEmpty;
  clearBtn.disabled = isEmpty;
  pagerEl?.classList.toggle("hidden", isEmpty);
}

function render(rows, offset) {
  rowsEl.innerHTML = "";
  setEmptyState(rows.length === 0);
  rows.forEach((r, idx) => {
    const id = r.id;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${offset + idx + 1}</td>
      <td>${escapeHtml(r.date)}</td>
      <td title="${escapeAttr(r.timestamp)}">${escapeHtml(formatTimestamp(r.timestamp))}</td>
      <td><div class="editable" contenteditable="true" data-id="${escapeAttr(
        String(id)
      )}" data-field="companyName">${escapeHtml(r.companyName)}</div></td>
      <td><div class="editable" contenteditable="true" data-id="${escapeAttr(
        String(id)
      )}" data-field="role">${escapeHtml(r.role)}</div></td>
      <td><div class="editable" contenteditable="true" data-id="${escapeAttr(
        String(id)
      )}" data-field="jobSummary">${escapeHtml(r.jobSummary)}</div></td>
      <td><a href="${escapeAttr(r.jobLink)}" target="_blank" rel="noopener">${escapeHtml(
      r.jobLink
    )}</a></td>
      <td><button type="button" class="danger del" data-id="${escapeAttr(String(r.id))}">Delete</button></td>
    `;
    rowsEl.appendChild(tr);
  });

  // Save edits on blur (per-cell).
  rowsEl.querySelectorAll(".editable[contenteditable='true']").forEach((el) => {
    el.addEventListener("keydown", (ev) => {
      // Enter saves + moves out (Shift+Enter makes a newline)
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        el.blur();
      }
    });

    el.addEventListener("focus", () => {
      el.dataset.before = cleanCellText(el.textContent || "");
    });

    el.addEventListener("blur", async () => {
      const before = el.dataset.before ?? "";
      const after = cleanCellText(el.textContent || "");
      if (after === before) return;
      const id = Number(el.getAttribute("data-id"));
      const field = el.getAttribute("data-field");
      if (!field || !Number.isFinite(id)) return;
      // Update visible text to cleaned version
      el.textContent = after;
      await saveField(id, field, after, el);
    });
  });

  rowsEl.querySelectorAll("button.del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-id"));
      const resp = await chrome.runtime.sendMessage({ type: "DELETE_BID", id });
      if (!resp?.ok) {
        setStatus(resp?.error || "Delete failed", true);
        return;
      }
      await load({ keepPage: true });
    });
  });
}

function updatePagerUi() {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const from = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(totalCount, currentPage * pageSize);
  pageInfoEl.textContent = `Page ${currentPage}/${totalPages} · ${from}-${to} of ${totalCount}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

function updateSortUi() {
  // Visual cue only for Timestamp sorting
  sortIndEl.textContent = sortDirection === "desc" ? "▼" : "▲";
}

async function load({ keepPage = false } = {}) {
  setStatus("Loading…");
  const countResp = await chrome.runtime.sendMessage({ type: "COUNT_BIDS" });
  if (!countResp?.ok) {
    setStatus(countResp?.error || "Failed to count rows", true);
    return;
  }
  totalCount = Number(countResp.count || 0) || 0;

  if (!keepPage) currentPage = 1;
  updatePagerUi();
  updateSortUi();

  const offset = (currentPage - 1) * pageSize;
  const resp = await chrome.runtime.sendMessage({
    type: "LIST_BIDS_PAGE",
    offset,
    limit: pageSize,
    direction: sortDirection,
  });
  if (!resp?.ok) {
    setStatus(resp?.error || "Failed to load", true);
    return;
  }

  setStatus(`${totalCount} record(s) in database`);
  render(resp.rows, offset);
}

document.getElementById("refresh").addEventListener("click", () => load({ keepPage: true }));

document.getElementById("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("export").addEventListener("click", async () => {
  const resp = await chrome.runtime.sendMessage({ type: "LIST_BIDS", direction: sortDirection });
  if (!resp?.ok) {
    setStatus(resp?.error || "Export failed", true);
    return;
  }
  if (!resp.rows.length) {
    setStatus("Nothing to export.", true);
    return;
  }
  const name = `bid-history-${new Date().toISOString().slice(0, 10)}.xls`;
  downloadExcel(name, rowsToExcelXml(resp.rows));
  setStatus(`Exported ${resp.rows.length} row(s) from database to ${name}`);
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Delete all bid records from the database? This cannot be undone.")) return;
  const resp = await chrome.runtime.sendMessage({ type: "CLEAR_ALL_BIDS" });
  if (!resp?.ok) {
    setStatus(resp?.error || "Clear failed", true);
    return;
  }
  setStatus("All records cleared from database.");
  await load();
});

prevBtn.addEventListener("click", async () => {
  currentPage = Math.max(1, currentPage - 1);
  updatePagerUi();
  await load({ keepPage: true });
});

nextBtn.addEventListener("click", async () => {
  currentPage = currentPage + 1;
  updatePagerUi();
  await load({ keepPage: true });
});

pageSizeEl.addEventListener("change", async () => {
  pageSize = Number(pageSizeEl.value || 50) || 50;
  currentPage = 1;
  await load();
});

sortTimestampBtn.addEventListener("click", async () => {
  sortDirection = sortDirection === "desc" ? "asc" : "desc";
  currentPage = 1;
  updateSortUi();
  await load();
});

updateSortUi();
load();
