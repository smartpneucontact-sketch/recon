# Atlantic Subaru — Recon

A small web app to coordinate vehicle reconditioning between sales, the manager, and the recon (cleaning) team.

- **Sales**: adds vehicles by stock number, picks a category (Delivery / Trade Auction / Service), and uploads photos of attention zones with text notes — from desktop or smartphone.
- **Recon**: opens the vehicle on their phone, sees the photos and notes, and marks the job as done when finished.
- **Manager**: can do everything sales and recon can, plus delete or reopen jobs.
- **Bilingual**: English / Spanish toggle in the top bar.
- **Auth**: per-user accounts (name + email + password), with bcrypt password hashing. Three roles: `manager`, `sales`, `recon`. Anyone can self-register on the signup page.
- **Storage**: SQLite + uploaded photos on disk. On Railway, attach a volume so data survives redeploys.

## Local development

```bash
npm install
cp .env.example .env   # set SESSION_SECRET
npm start
```

Open <http://localhost:3000>, click *Create one* and sign up. The first user can pick any role (typically `manager`).

Data (SQLite DB + uploaded photos) is written to `./data/` (gitignored).

## Deploy to Railway via Git

1. **Push this repo to GitHub** (or any Git remote Railway can reach).

2. **Create a Railway project** → "Deploy from GitHub repo" → pick this repo. Railway will auto-detect Node and run `npm start`.

3. **Attach a Volume** so data persists across deploys:
   - In the service → **Volumes** → **New Volume**
   - **Mount path**: `/data`
   - Size: 1 GB is plenty to start (photos are compressed client-side to ~1600px).

4. **Set environment variables** (service → **Variables**):
   ```
   SESSION_SECRET = <long random string, e.g. `openssl rand -hex 32`>
   DATA_DIR       = /data
   NODE_ENV       = production
   ```
   `PORT` is set automatically by Railway — don't override it.

5. **Generate a public domain** in the service's **Settings → Networking** so phones can reach it.

That's it. Push to your default branch and Railway will redeploy automatically.

## How it works

- `server.js` — Express server, session auth, REST API, static file serving.
- `db.js` — SQLite schema and connection (better-sqlite3, WAL mode).
- `public/` — single-page frontend (no build step, vanilla JS).
  - `index.html` · `styles.css` · `app.js` · `i18n.js`
- Photos are stored on disk under `${DATA_DIR}/uploads/`. SQLite DB at `${DATA_DIR}/recon.db`.
- Photos are resized to max 1600px and re-encoded as JPEG **in the browser** before upload — small payloads, fast on mobile.

## API quick reference

| Method | Path | Allowed roles | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/signup` | — | Body: `{ name, email, password, role }` → creates user, sets session |
| `POST` | `/api/login` | — | Body: `{ email, password }` → sets session |
| `POST` | `/api/logout` | — | |
| `GET`  | `/api/me` | — | Returns current `{ user }` or `null` |
| `GET`  | `/api/cars?status=&category=` | any | Lists vehicles with photo counts and attribution names |
| `GET`  | `/api/cars/:id` | any | Returns car (with `created_by_name`, `completed_by_name`) + photos |
| `POST` | `/api/cars` | manager, sales | `{ stock_number, category }` |
| `DELETE` | `/api/cars/:id` | manager | Deletes car and its photos |
| `POST` | `/api/cars/:id/photos` | manager, sales | `multipart/form-data` with `photo` file and optional `note` |
| `DELETE` | `/api/photos/:id` | manager | |
| `POST` | `/api/cars/:id/complete` | manager, recon | Recon team marks done; records who marked it |
| `POST` | `/api/cars/:id/reopen` | manager | Reverts to pending |
| `GET`  | `/uploads/:filename` | any | Authenticated photo download |
| `GET`  | `/healthz` | — | Liveness probe |

## Notes / future work

- Photos are not watermarked or stripped of EXIF — add `sharp` server-side if you want to strip metadata.
- No per-user accounts. If you ever need accountability per cleaner, switch to named accounts (small refactor: replace the two-password check with a `users` table).
- Sessions are stored in-memory (`express-session` default). Fine for a single Railway service; if you ever run multiple replicas, swap in a session store backed by SQLite or Redis.
