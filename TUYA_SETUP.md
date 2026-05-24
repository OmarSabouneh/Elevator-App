# Tuya IoT — breaker setup for Elevator App

The app can turn your Tuya smart breaker **on/off via Tuya Cloud** from a **remote server** (no PC in the building).

## What to send me / put in `server/.env`

| Variable | Where to find it |
|----------|------------------|
| **TUYA_ACCESS_ID** | Tuya IoT Platform → your Cloud Project → **Overview** → **Access ID** (Client ID) |
| **TUYA_ACCESS_SECRET** | Same page → **Access Secret** (Client Secret) |
| **TUYA_REGION** | Same page → **Data Center**: `eu`, `us`, `cn`, or `in` (use the code matching your center) |
| **TUYA_DEVICE_ID** | **Devices** → your breaker → **Device ID** (e.g. `bfxxxxxxxxxxxx`) |
| **TUYA_DP_CODE** | From `npm run tuya:info` — the `code` for on/off (often `switch`, `switch_1`, or `switch_led`) |

Optional:

| Variable | When needed |
|----------|-------------|
| **TUYA_ON_VALUE** / **TUYA_OFF_VALUE** | If on/off are not `true`/`false` (e.g. `1` / `0`) |
| **TUYA_BASE_URL** | Only if auto region URL is wrong (see Tuya docs) |

Example `server/.env`:

```env
SWITCH_TYPE=tuya
TUYA_ACCESS_ID=xxxxxxxxxxxxxxxxxx
TUYA_ACCESS_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
TUYA_REGION=eu
TUYA_DEVICE_ID=bfxxxxxxxxxxxxxxxx
TUYA_DP_CODE=switch_1
TUYA_ON_VALUE=true
TUYA_OFF_VALUE=false
ELEVATOR_PULSE_MS=60000
```

## Tuya platform checklist

1. Log in: [https://iot.tuya.com](https://iot.tuya.com)
2. **Cloud** → **Development** → open your project (or create **Smart Home** / **Custom** cloud project).
3. Enable **Device Control** / **IoT Core** APIs for the project.
4. Link the breaker to the project:
   - **Devices** → **Link Tuya App Account** (if paired in Smart Life), **or**
   - Add the device when provisioning through your project.
5. Confirm the breaker shows **Online** in the console.
6. Copy **Access ID**, **Access Secret**, **Data Center**, and **Device ID**.

## Test from your PC

```bash
npm install --prefix server
npm run tuya:info --prefix server
npm run tuya:test --prefix server
```

Then restart the app (`npm run dev`) and use **Call Elevator** with an active subscription.

## How it works in the app

1. User taps **Call Elevator**
2. Server calls Tuya Cloud API → breaker **ON**
3. Waits `ELEVATOR_PULSE_MS` (default 1 minute)
4. Breaker **OFF**

## Troubleshooting

| Error | Fix |
|-------|-----|
| `sign invalid` | Wrong secret or wrong **TUYA_REGION** |
| `device not exist` | Wrong **TUYA_DEVICE_ID** or device not linked to project |
| `command not support` | Wrong **TUYA_DP_CODE** — run `tuya:info` |
| Device offline | Breaker must be on WiFi and online in Smart Life / Tuya app |

Do **not** commit `server/.env` or share **Access Secret** in chat — use placeholders if you need help debugging.
