# 234Mile live pilot verification — 28 September 2026

## Release status

The passenger web application is live at `https://234mile.tundebadeniyi.workers.dev` from branch `pilot-revamp` and Cloudflare version `fdc5fc02`. The production Supabase project is healthy, the database schema and seat-booking migration are applied, anonymous passenger sessions are enabled, and the web and Android authentication return URLs are registered.

## Checks passed

- Production web build completed with the deployment configuration guard enabled.
- Cloudflare built commit `4797b89` successfully and assigned 100% of production traffic to version `fdc5fc02`.
- The public site returned the current passenger interface and loaded the ride search, shared-trip link, seat-request status, and driver entry actions.
- Supabase site URL is `https://234mile.tundebadeniyi.workers.dev`.
- Supabase allows both `https://234mile.tundebadeniyi.workers.dev` and `app.mile234://auth/callback` as authentication redirects.
- The Android web bundle was synchronized from the production build.
- The pilot APK contains the current compiled JavaScript and CSS, package ID `app.mile234.ride`, minimum Android API 24, target API 36, and Internet permission.
- APK alignment and signature verification passed with APK Signature Schemes v2 and v3.
- APK SHA-256: `5BF04E1431B1ECF43113FC924A4914D33FCD2B0A098A686EE49542D623FD875F`.

## Remaining live-device checks

- Google driver sign-in cannot be exercised until a Google OAuth web client is created and enabled in Supabase.
- Driver publish, passenger request, confirmation/decline, outside-app transfer, full-trip hiding, cancellation, and final-seat concurrency need two signed-in test identities and two physical devices or browser profiles.
- Offline/reconnect behavior still needs testing on Nigerian mobile networks.
- The APK is a debug-signed pilot package. A Play Store or public production release should use a protected release signing key and an Android App Bundle.

## Android build note

Gradle remains unable to start its local worker process on this Windows session because Java cannot establish its loopback pipe. The installable pilot APK was therefore refreshed from the existing compiled native shell, populated with the verified production web bundle, realigned, signed, and independently verified with Android build tools.
