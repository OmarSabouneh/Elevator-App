# Elevator Access — Mobile Web App

Mobile-first web app for apartment elevator access: residents sign in with **mobile number + password**, pay via **Whish Money**, get **30 days** of access, and trigger a **WiFi relay** from the app to call the elevator.

## Features

- User database (SQLite) with phone as username
- Password login (bcrypt)
- Whish Money payments (codnloc gateway) — 30-day subscription after payment
- **Call Elevator** — keeps the breaker on for 1 minute (configurable)
- Admin panel — list all users, grant access manually, view payments

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

   For local testing, keep `WHISH_MODE=mock` and `SWITCH_TYPE=mock`.

3. **Run**

   ```bash
   npm run dev
   ```

   - App: http://localhost:5173  
   - API: http://localhost:3001  

4. **Admin login** — uses `ADMIN_PHONE` and `ADMIN_PASSWORD` from `.env` (created on first server start).

5. **Test flow**

   - Register with a phone number  
   - Tap **Pay with Whish Money** → mock payment page → **Simulate successful payment**  
   - Tap **Call Elevator**

## Whish Money (production)

1. Register at [codnloc Whish API](https://pay.codnloc.com/api_documentation.html) and get `website` + `secret`.
2. Set in `server/.env`:

   ```
   WHISH_MODE=live
   WHISH_WEBSITE=your-domain.com
   WHISH_SECRET=your_secret
   SUBSCRIPTION_AMOUNT=25
   SUBSCRIPTION_CURRENCY=USD
   ```

3. Configure **return URL** in your Whish dashboard:

   ```
   https://YOUR-API-DOMAIN/api/payments/confirm
   ```

4. Configure **webhook URL** (recommended):

   ```
   https://YOUR-API-DOMAIN/api/payments/webhook
   ```

   Send header `X-Webhook-Secret: <PAYMENT_WEBHOOK_SECRET>` or body `{ "secret": "...", "order_id": "ELV-..." }`.

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
3. Use HTTPS (required for PWA and payments)
4. Set strong `JWT_SECRET` and `PAYMENT_WEBHOOK_SECRET`
5. Point `CLIENT_URL` to your public app URL

## Project structure

```
elevator-access-app/
├── client/          React mobile web UI (Vite)
├── server/          Express API + SQLite
├── .env.example
└── README.md
```

## What you may still need

- **Exact Whish callback format** — confirm field names with codnloc support (+961 3 687 150) and adjust `server/src/index.js` webhook handler if needed.
- **Switch hardware** — confirm your relay model (Shelly, Sonoff, Tasmota, etc.) so URLs match.
- **Legal / building approval** — payment amounts, resident list, and elevator wiring should be approved by building management.
