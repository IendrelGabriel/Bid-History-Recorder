import json
import os
import sqlite3
import struct
import sys


def db_path() -> str:
    localapp = os.environ.get("LOCALAPPDATA")
    if not localapp:
        home = os.path.expanduser("~")
        localapp = os.path.join(home, "AppData", "Local")
    dir_path = os.path.join(localapp, "AutomaticBidRecord")
    os.makedirs(dir_path, exist_ok=True)
    return os.path.join(dir_path, "bids.sqlite")


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
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
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_bids_timestamp ON bids(timestamp);")
    conn.commit()


def read_message():
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len:
        return None
    msg_len = struct.unpack("<I", raw_len)[0]
    data = sys.stdin.buffer.read(msg_len)
    if not data:
        return None
    return json.loads(data.decode("utf-8"))


def send_message(obj):
    out = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(out)))
    sys.stdout.buffer.write(out)
    sys.stdout.buffer.flush()


def main():
    conn = sqlite3.connect(db_path())
    init_db(conn)

    while True:
        msg = read_message()
        if msg is None:
            break

        try:
            t = msg.get("type")
            if t == "PING":
                send_message({"ok": True, "dbPath": db_path()})
                continue

            if t == "UPSERT_BID" and msg.get("payload"):
                p = msg["payload"]
                conn.execute(
                    """
                    INSERT INTO bids (id, date, timestamp, company_name, job_link, job_summary, role, page_title)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      date=excluded.date,
                      timestamp=excluded.timestamp,
                      company_name=excluded.company_name,
                      job_link=excluded.job_link,
                      job_summary=excluded.job_summary,
                      role=excluded.role,
                      page_title=excluded.page_title;
                    """,
                    (
                        p.get("id"),
                        str(p.get("date", "")),
                        str(p.get("timestamp", "")),
                        str(p.get("companyName", "")),
                        str(p.get("jobLink", "")),
                        str(p.get("jobSummary", "")),
                        str(p.get("role", "")),
                        str(p.get("pageTitle", "")),
                    ),
                )
                conn.commit()
                send_message({"ok": True})
                continue

            send_message({"ok": False, "error": "Unknown message type"})
        except Exception as e:
            send_message({"ok": False, "error": str(e)})


if __name__ == "__main__":
    main()

