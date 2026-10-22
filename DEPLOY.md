# Deploy online (free tier)

Stack: **Supabase** (database) + **Render** (API) + **Vercel** (website).

Local dev without Supabase: omit `DATABASE_URL` → uses SQLite in `server/data/`.

---

## 1. Supabase (database)

1. [supabase.com](https://supabase.com) → **New project** (region: Europe).
2. **SQL Editor** → run `supabase/schema.sql` (or let the API create tables on first start).
3. **Project Settings** → **Database** → **Connection string** → **URI** → **Transaction pooler** (port **6543**).
4. Copy the URI → you will set `DATABASE_URL` on Render.

Replace `[YOUR-PASSWORD]` in the URI with your database password.

---

## 2. GitHub

Push the repo (never commit `server/.env`).

---

## 3. Render (API) — free

1. [render.com](https://render.com) → **New Web Service** → your repo.
2. Settings:

| Field | Value |
|--------|--------|
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Plan | **Free** |

3. **Environment** — add all variables from `server/.env`, plus:

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Supabase pooler URI |
| `DATABASE_SSL` | `true` |
| `CLIENT_URL` | `https://YOUR-APP.vercel.app` (after step 4) |
| `JWT_SECRET` | long random string |
| `TUYA_*` | your Tuya credentials |
| `SWITCH_TYPE` | `tuya` |
| `ADMIN_PHONE` / `ADMIN_PASSWORD` / `ADMIN_USERNAME` | admin login |

4. Deploy → note URL: `https://elevator-api-xxxx.onrender.com`

5. Test: open `https://YOUR-API.onrender.com/api/health` → should show `"database":"postgres"`.

---

## 4. Vercel (website) — free

1. [vercel.com](https://vercel.com) → import GitHub repo.
2. **Root Directory:** `client`
3. **Environment variable:**

| Name | Value |
|------|--------|
| `VITE_API_URL` | `https://YOUR-API.onrender.com/api` |

4. Deploy → note URL: `https://your-app.vercel.app`

5. Back on **Render** → set `CLIENT_URL` to that Vercel URL → **Manual Deploy**.

---

## Troubleshooting “Failed to fetch” on Vercel

1. **Vercel env** → `VITE_API_URL` = `https://YOUR-API.onrender.com/api` (must include `/api`, no trailing slash).
2. **Redeploy Vercel** after changing env vars (Vite bakes them in at build time).
3. **Render env** → `CLIENT_URL` = your exact Vercel URL, e.g. `https://your-app.vercel.app` (no `/` at the end).
4. Open `https://YOUR-API.onrender.com/api/health` in the browser — must return JSON (wake Render if it slept).
5. Optional on Render: `ALLOW_VERCEL_PREVIEWS=true` if you use a `*.vercel.app` preview URL different from `CLIENT_URL`.

---

## 5. Test production

1. Open Vercel URL on your phone.
2. Register / log in (phone + password).
3. Admin → **Activate 31 days** for each resident.
4. **Call Elevator** → Tuya breaker should run.

---

## Free tier limits & Keeping Supabase Active

- **Render:** Sleeps when idle for 15 minutes; first request after sleep takes ~30s.
- **Supabase:** Pauses after 7 days of inactivity (no SQL queries executed).
- **Vercel:** Hobby free for personal projects.

### Prevent Supabase Pausing (Database Keep-Alive)
The backend automatically executes a `SELECT 1` ping against Supabase on startup and schedules a background ping once every 24 hours (`DB_PING_INTERVAL_HOURS=24`).

**Recommended setup to keep both Render and Supabase active 24/7:**
Create a free daily ping monitor (e.g. using [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com)):
- **URL:** `https://YOUR-API.onrender.com/api/ping-db`
- **Schedule:** Once per day (or every 12 hours)
- **HTTP Method:** `GET`

This ping wakes up Render and executes a query on Supabase, preventing both services from pausing.

---

## 6. Switch Availability Monitoring & Instant Push Alerts

The app automatically checks the WiFi breaker switch availability **every 5 minutes**. If the switch goes offline, an instant push notification is sent to the admin.

### How Admin Receives Push Notifications (Without Changing the APK):
1. Open the app on your phone (using **Chrome on Android** or installed via **Add to Home Screen / PWA**).
2. Log in with your admin credentials.
3. In the Admin dashboard, find the **Breaker Switch Status** card and tap **Enable Push Notifications**.
4. Tap **Send Test Push** to verify instant notification delivery on your phone.
5. Whenever the switch goes offline, you will immediately receive an alert notification. When it reconnects, a recovery notification will confirm it is back online.

### Keep 5-Minute Checks Running 24/7 on Free-Tier Render:
Because Render's free tier sleeps after 15 minutes of inactivity, set a free 5-minute monitor on [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com):
- **URL:** `https://YOUR-API.onrender.com/api/switch/availability`
- **Schedule:** Every 5 minutes
- **Method:** `GET`

This keeps the API awake 24/7 so the 5-minute switch monitor never stops checking.


