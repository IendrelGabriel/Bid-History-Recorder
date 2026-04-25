# Automatic Bid Record (Chrome Extension)

Records job application submissions and saves them to the extension database. Optionally mirrors each record into a **local SQLite** database on Windows via a Native Messaging host.

## Install extension (Chrome)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `Automatic Bid Record`
5. Pin the extension (optional)

## Use

- Apply / submit applications on job sites.
- Open the extension popup to see the saved history.
- Click **Export Excel** to download an `.xls` file generated from the database.

## Local SQLite (Windows) — optional

Chrome extensions cannot write to SQLite directly. To save into a local SQLite DB, this project includes a **Native Messaging host** that receives records from the extension and writes them to SQLite.

### 1) Run the installer

Open PowerShell and run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
cd "C:\Users\Administrator\Documents\utility\Projects\Automatic Bid Record\native"
.\install-windows.ps1
```

When asked, paste your **Extension ID** from `chrome://extensions`.

### 2) Enable mirroring in Settings

Open extension **Settings** and enable:

- **Mirror saves to local SQLite (Windows native host)**

### SQLite file path

The DB will be created at:

- `%LOCALAPPDATA%\AutomaticBidRecord\bids.sqlite`

### Schema

Table: `bids`

- `id` (INTEGER PRIMARY KEY)
- `date` (TEXT)
- `timestamp` (TEXT)
- `company_name` (TEXT)
- `job_link` (TEXT)
- `job_summary` (TEXT)
- `role` (TEXT)
- `page_title` (TEXT)

