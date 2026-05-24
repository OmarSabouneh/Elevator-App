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

## 5. Test production

1. Open Vercel URL on your phone.
2. Register / log in (phone + password).
3. Admin: grant +30d or mock Whish payment.
4. **Call Elevator** → Tuya breaker should run.

---

## Whish (when ready)

- Return URL: `https://YOUR-API.onrender.com/api/payments/confirm`
- Webhook: `https://YOUR-API.onrender.com/api/payments/webhook`
- Set `WHISH_MODE=live` and real `WHISH_WEBSITE` / `WHISH_SECRET`

---

## Free tier limits

- **Render:** sleeps when idle; first request may take ~30s.
- **Supabase:** pauses after long inactivity; wake in dashboard.
- **Vercel:** hobby free for personal projects.
