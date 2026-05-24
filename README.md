# Elevator Access — Mobile Web App

Mobile-first web app for apartment elevator access: residents sign in with **mobile number + password**, get **31 days** of access when the admin activates them, and trigger the building breaker from the app to call the elevator.

## Features

- User database with phone login and last name on signup
- Password login (bcrypt)
- Admin activates **31-day** subscription per resident (no online payments)
- **Call Elevator** — keeps the breaker on for 1 minute (configurable)
- Admin panel — list users by phone and last name, activate access

## Quick start (development)

1. **Install dependencies**

   ```bash
   npm run setup
   ```

2. **Configure environment**

   Copy `.env.example` to `server/.env` and edit:

   ```bash
   copy .env.example server\.env
   ```

   For local testing, keep `SWITCH_TYPE=mock`.

3. **Run**

   ```bash
   npm run dev
   ```

   - App: http://localhost:5173  
   - API: http://localhost:3001  

4. **Admin login** — uses `ADMIN_PHONE` and `ADMIN_PASSWORD` from `.env` (created on first server start).

5. **Test flow**

   - Register with mobile number and last name  
   - Admin → **Activate 31 days** for that user  
   - Tap **Call Elevator**

## WiFi switch setup

The server turns a relay **on** briefly when a user with active access taps **Call Elevator**, then **off** again.

| `SWITCH_TYPE` | Use case |
|---------------|----------|
| `mock` | Development — logs only |
| `http` | Any switch with HTTP URLs (`SWITCH_ON_URL`, `SWITCH_OFF_URL`) |
| `shelly` | Shelly relay (`SHELLY_HOST`, `SHELLY_RELAY_ID`) |

Example Shelly on your building WiFi:

```
SWITCH_TYPE=shelly
SHELLY_HOST=http://192.168.1.50
SHELLY_RELAY_ID=0
ELEVATOR_PULSE_MS=60000
```

**Important:** The server must run on a network that can reach the switch (same LAN or VPN). Do not expose the switch directly to the public internet without authentication.

## Deployment

1. Build the client: `npm run build`
2. Serve `client/dist` from the API or nginx
3. Use HTTPS for production
4. Set strong `JWT_SECRET`
5. Point `CLIENT_URL` to your public app URL

See `DEPLOY.md` for Supabase + Render + Vercel.

## Project structure

```
elevator-access-app/
├── client/          React mobile web UI (Vite)
├── server/          Express API + SQLite
├── .env.example
└── README.md
```

## What you may still need

- **Switch hardware** — confirm your Tuya device or relay is wired correctly.
- **Legal / building approval** — resident list and elevator wiring should be approved by building management.
