# FarmaGO Mobile

The Expo app opens FarmaGO's responsive web app in a native WebView. This keeps buyer and staff flows aligned with the web app, including sign-in, cart, checkout, pharmacy and courier selection, prescriptions, orders, tracking, cancellation/refund requests, and pharmacy/admin workspaces. Web sessions and cart data stay in the web app's storage.

The native shell adds Android back navigation, safe areas, external-link handling, and a connection error/retry screen.

## Run locally

1. Install workspace dependencies from the repository root with `bun install`.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set `EXPO_PUBLIC_WEB_URL`:
   - Android emulator: `http://10.0.2.2:5173`
   - iOS Simulator: `http://localhost:5173`
   - Physical device: `http://<computer-lan-ip>:5173`
   - Deployed app: its HTTPS web origin.
3. For local development, copy the root `.env.example` to `.env`. Set `WEB_ORIGINS` to include the exact web origin used on the device. The example includes localhost, 127.0.0.1, and the Android emulator origin. Add the computer's LAN origin when using a physical device.
4. Start PostgreSQL, then run the API and web app in separate terminals from the repository root:

   ```bash
   bun run dev:api
   bun run dev:web
   ```

5. In another terminal, start Expo and open the app in Expo Go:

   ```bash
   bun run dev:mobile
   ```

For normal use, set `EXPO_PUBLIC_WEB_URL` to the deployed HTTPS web origin. That way the app always gets the same pages and workflows as web without duplicating their implementation in React Native.
