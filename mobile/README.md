# Reamarc mobile companion

Internal 15-person app for check-in / check-out. It uses the **same FastAPI + MongoDB** as the desktop site.

**Until the Android APK is rolled out, employees still check in on the website.** The mobile app is for the CEO demo and internal testing. Desktop punch is not removed yet.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the phone talks to the same backend as the desktop app, APK size, updates, and iOS / Expo Go.

## Current rollout (do not build APK / IPA yet)

1. **Now:** keep testing on **Expo Go** on both Android and iPhone (SDK 54 store app).
2. **When testing is done:** roll out to the team on Expo Go, **Android first**.
3. **iPhone stays on Expo Go** until we later decide on a paid Apple Developer IPA / AltStore.
4. A standalone Android APK is a **later** step (after Expo Go testing is successful). You still need this PC running Expo + the API (or Render) while people use Expo Go.

## What you need

1. Backend already running (local or Render).
2. [Expo Go](https://expo.dev/go) on the phone from the **App Store / Play Store** (this must be the store app — it only runs **Expo SDK 54**).
3. Node.js on the computer that will start the app.
4. Phone and computer on the **same Wi-Fi** if the API is `localhost`. If the API is on Render, any internet connection works.

## 1. Point the app at your API

On your computer, find the API URL.

- **Deployed backend (Render):** `https://YOUR-SERVICE.onrender.com/api/v1`
- **Local backend + physical phone:** do **not** use `localhost`. Use your PC’s LAN IP, e.g. `http://192.168.1.23:8000/api/v1`

Find the LAN IP:

- Windows: `ipconfig` → IPv4 Address on the **Wi-Fi** adapter (not Ethernet 192.168.56.x — that is VirtualBox and phones cannot reach it)
- Make sure Windows Firewall allows port 8000

In `mobile/` create a file `.env`:

```
EXPO_PUBLIC_API_URL=http://YOUR-LAN-IP:8000/api/v1
```

or

```
EXPO_PUBLIC_API_URL=https://YOUR-RENDER-HOST/api/v1
```

## 2. Start the backend (if local)

From the repo, same way you already run it, for example:

```
cd backend
.\.venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` is required so a phone can reach this PC.

## 3. Start Expo

Stop any old Expo process (Ctrl+C), then:

```
cd mobile
npm start
```

You should see **Expo SDK 54** in the terminal (not 57). Then scan the QR with Expo Go.

```
cd mobile
npm start
```

If the QR code does not open on the phone, try:

```
npx expo start --tunnel
```

## 4. iPhone (free)

1. Install **Expo Go** from the App Store.
2. Open the Camera app (or Expo Go) and scan the QR code.
3. Allow **Location** (While Using) and **Face ID** / passcode when asked.
4. Log in with the same Reamarc email/password as the website.
5. Device lock (one phone per account) is **off for testing** so you can switch accounts. Turn it back on before staff use.

## 5. Android (free)

1. Install **Expo Go** from Play Store.
2. Open Expo Go → Scan QR code.
3. Allow **Location** and **Notifications**.
4. Log in with the same Reamarc account.
5. Device lock is off for testing — you can switch accounts on the same phone.

## 6. Office punch test (both phones)

Stand at HQ, join **office Wi-Fi**, then:

1. Open Punch tab. Pills should show GPS near HQ and Office Wi-Fi.
2. Tap **Check In** → Face ID / fingerprint / PIN.
3. On the **desktop** Dashboard (refresh): same check-in time appears.
4. Turn off Wi-Fi (use mobile data) at HQ → Check In must **fail** (GPS + Wi-Fi AND).
5. Outside HQ on office Wi-Fi (or VPN) → Check In must **fail**.
6. Approved WFH: punch from home should **succeed**.
7. Check Out. If you are early/late, enter OT/UT reason. OT stays pending until HR approves.
8. Device lock is off for testing; a second account on the same phone should sign in.
9. Submit Leave / WFH / short leave / correction from Requests. HR can review on the phone (**Requests → To review**) and on desktop.

## 7. HR custom notification

Expo Go **cannot** show lock-screen / remote pushes (the Expo terminal warning is expected). Testing still works:

1. Keep Reamarc **open** on the phone (Alerts tab is fine).
2. On desktop: Admin → **Mobile & Alerts** → title + body → Send.
3. Within a few seconds the phone should show a local banner, and the message appears under **Alerts**.

Lost phone: **Transfer** unbinds the old device so they can log in on a new one.

## 8. If something fails

| Problem | Fix |
|---|---|
| Network error / failed to fetch | Wrong API URL, backend not on `0.0.0.0`, or phone not on same Wi-Fi |
| “only available on the mobile app” from desktop | Should not happen until we flip `ENFORCE_MOBILE_PUNCH_ONLY`. Desktop punch is still enabled. |
| “locked to another phone” | HR Transfer, then log in again |
| GPS coarse / not at office | Wait for a tight GPS fix outdoors or by a window |
| Not on office Wi-Fi | Join office Wi-Fi. Admin must have the office public IP in Attendance Policies |
| Push never arrives | Expected in Expo Go. Keep the app open and check the **Alerts** tab. Lock-screen push needs a development build, not Expo Go. |

Do not push this branch to `main`. Stay on `feat/mobile-companion`.
