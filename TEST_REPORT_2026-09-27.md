# 234Mile essential test report — 27 September 2026

## Result

The source and local web build passed the available essential checks. The application is **not yet certified for live pilot use** because no live Supabase project is configured, so cross-device data, Google OAuth, row-level security, and database concurrency could not be exercised. The Android Gradle test/build was also blocked by the current Windows environment's inability to create Gradle's loopback connection.

## Passed

- JavaScript syntax checks for `src/main.js`, `public/sw.js`, and `scripts/check-deploy-env.mjs`.
- Local Vite production build.
- Deployment-mode Vite build with non-secret test configuration.
- Deployment guard rejects missing configuration.
- Deployment guard rejects a Supabase `sb_secret_` key.
- Web server returns the app shell, manifest, service worker, and query-string trip URL with HTTP 200.
- Compiled bundle contains the local-mode warning, pending-confirmation wording, four-seat default, and full-trip state.
- Capacitor copied the compiled web application and detected the App and Browser plugins.
- Android source declares API 24 minimum, API 36 target, Internet permission, and the `app.mile234://auth/callback` deep link.
- Static database-contract checks confirmed: seat-request RLS, one active request per passenger/trip, pending requests do not consume seats, driver-only confirmation, row locking, seat-capacity invariant, anonymous-driver write restrictions, full-trip shared-link control, and confirmed-seat release on cancellation.
- Project was restored to its unconfigured local-mode build after testing; test Supabase values were process-only and were not saved.

## Blocked or still required

- Applying `schema.sql` and `002_seat_booking.sql` to an actual Supabase test project.
- Two-device driver/passenger flow: Google sign-in, publish, search, anonymous request, confirm/decline, outside-app transfer, full-trip visibility, cancellation, and reopening seats.
- Real row-level-security privacy checks using two drivers and two anonymous passengers.
- Concurrent confirmation of the final seat against PostgreSQL.
- Document upload and private-file access against Supabase Storage.
- Offline/reconnect behavior on real Android phones and mobile networks.
- Android `testDebugUnitTest` and a fresh APK build. Gradle failed before running tasks with `java.io.IOException: Unable to establish loopback connection`; retry on a normal Android Studio/Gradle environment.

## Go-live decision

Do not distribute the current local-mode APK or call the service live yet. Configure a Supabase test project, rebuild both targets with the real publishable key and final web URL, then complete the two-device checklist in `WEB_GO_LIVE_GUIDE.md` and `ANDROID_GO_LIVE_GUIDE.md`.
