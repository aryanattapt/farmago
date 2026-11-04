# FarmaGO Mobile

Expo + React Native app in the `apps/mobile` workspace.

## Run

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the API URL reachable from the device.
2. Start the API and PostgreSQL from the repository root.
3. Run `bun install` at the repository root. If Bun cannot link workspaces on Windows, run `npm install --prefix apps/mobile --workspaces=false --package-lock=false` instead.
4. Run `bun run dev:mobile` from the repository root and open the app in Expo Go.

Use `http://10.0.2.2:4000/api/v1` for the Android emulator. Use your computer's LAN IP for a physical phone. iOS Simulator can use `http://localhost:4000/api/v1`.

The app currently includes the public catalog, product search and categories, and an in-memory cart. Login, checkout, order history, and staff panels remain web-only.
