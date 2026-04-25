/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const os = require("os");
const Database = require("better-sqlite3");

function getDbPath() {
  const base =
    process.env.LOCALAPPDATA ||
    (process.platform === "win32"
      ? path.join(os.homedir(), "AppData", "Local")
      : path.join(os.homedir(), ".local", "share"));
  const dir = path.join(base, "AutomaticBidRecord");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "bids.sqlite");
}

const db = new Database(getDbPath());
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS bids (
    id INTEGER PRIMARY KEY,
    date TEXT,
    timestamp TEXT,
    company_name TEXT,
    job_link TEXT,
    job_summary TEXT,
    role TEXT,
    page_title TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_bids_timestamp ON bids(timestamp);
`);

const upsert = db.prepare(`
  INSERT INTO bids (id, date, timestamp, company_name, job_link, job_summary, role, page_title)
  VALUES (@id, @date, @timestamp, @companyName, @jobLink, @jobSummary, @role, @pageTitle)
  ON CONFLICT(id) DO UPDATE SET
    date=excluded.date,
    timestamp=excluded.timestamp,
    company_name=excluded.company_name,
    job_link=excluded.job_link,
    job_summary=excluded.job_summary,
    role=excluded.role,
    page_title=excluded.page_title;
`);

function readMessage() {
  const lenBuf = Buffer.alloc(4);
  const bytes = fs.readSync(0, lenBuf, 0, 4, null);
  if (bytes === 0) return null;
  if (bytes < 4) throw new Error("Invalid message length header");
  const len = lenBuf.readUInt32LE(0);
  const msgBuf = Buffer.alloc(len);
  fs.readSync(0, msgBuf, 0, len, null);
  return JSON.parse(msgBuf.toString("utf8"));
}

function sendMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(json.length, 0);
  fs.writeSync(1, lenBuf);
  fs.writeSync(1, json);
}

while (true) {
  const msg = readMessage();
  if (!msg) break;

  try {
    if (msg.type === "PING") {
      sendMessage({ ok: true, dbPath: getDbPath() });
      continue;
    }
    if (msg.type === "UPSERT_BID" && msg.payload) {
      const p = msg.payload;
      upsert.run({
        id: p.id ?? null,
        date: String(p.date ?? ""),
        timestamp: String(p.timestamp ?? ""),
        companyName: String(p.companyName ?? ""),
        jobLink: String(p.jobLink ?? ""),
        jobSummary: String(p.jobSummary ?? ""),
        role: String(p.role ?? ""),
        pageTitle: String(p.pageTitle ?? ""),
      });
      sendMessage({ ok: true });
      continue;
    }
    sendMessage({ ok: false, error: "Unknown message type" });
  } catch (e) {
    sendMessage({ ok: false, error: String(e?.message || e) });
  }
}

