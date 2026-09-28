# 234Mile pilot app

One responsive codebase for the web and Android. Passengers browse published interstate journeys, contact drivers by call or WhatsApp, then submit seats they arranged for driver confirmation. A request is pending until the driver confirms it. Drivers use Google sign-in, publish trips, count outside-app customers, confirm or decline requests, and cancel bookings or trips. The driver sets the entire displayed fare; 234Mile adds no fee or payment.

## Current status

The controlled pilot is live. The frontend source is in the public GitHub repository `AllEternal/234Mile` on branch `pilot-revamp`; Cloudflare automatically builds that branch and serves the web app at `https://app.234mile.workers.dev`. Supabase project `tolipwgukxfgtatunpoc` supplies the shared database, authentication, private driver-document storage, row-level security, and atomic seat-booking operations. Google driver sign-in and anonymous passenger sessions are enabled.

The installable pilot APK is stored outside the public repository at `C:\Users\Mercy and Grace\OneDrive\Documents\ChatGPT\234Mile\234Mile-Live-Pilot.apk`. For the exact access, installation, Google Drive sharing, and update procedure, read [`PILOT_DISTRIBUTION_GUIDE.md`](PILOT_DISTRIBUTION_GUIDE.md). The older web and Android go-live guides remain useful as build references, but sections describing the project as unconfigured or local-only are historical.

## Connect the shared database

1. Create a new Supabase project. In its SQL editor, run [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/002_seat_booking.sql`](supabase/002_seat_booking.sql). For an existing project already using `schema.sql`, run only the second file once. It preserves existing remaining-seat counts as outside-app bookings. Do not run the old ZIP's `supabase-setup.sql` for this app.
2. In Supabase Authentication, enable Google for drivers and anonymous sign-ins for passengers. Create a Google OAuth client in Google Cloud and supply its client ID and secret to Supabase. Add your web URL and `app.mile234://auth/callback` as allowed redirect URLs in Supabase. The Google OAuth redirect URI itself is the Supabase callback URL shown by the provider setup. The current app does not yet pass a CAPTCHA token for anonymous sign-in; see the go-live guide before enabling Supabase CAPTCHA or inviting public testers.
3. Copy `.env.example` to `.env` and fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_PUBLIC_APP_URL`. The last value is the HTTPS URL serving the web app and is required for drivers to share full-trip links from Android. Never put a service-role key in this file. The public key is embedded in the web build; database RLS and seat-operation functions protect writes.
4. Run `npm ci`, `npm run build:deploy`, and `npx cap sync android`. The deploy build refuses missing/placeholder configuration. Rebuild both targets after changing `.env`.
5. Host `dist/` on a static HTTPS host with the SPA root served as `index.html`. Configure that origin in Supabase redirect URLs. Browsers require HTTPS for PWA installation and service workers outside localhost.

## Local run

`npm run dev` starts the web development server. `npm run build` produces the deployable web app in `dist/`. `npm run preview` serves that build. The app caches its shell and last fetched listings for weak connectivity. Cached journeys carry an out-of-date notice, and drivers save local drafts to publish manually after reconnecting. Submitting or confirming seats, publishing, count changes and cancellation require a successful server response. A passenger's request status is available on the same device while its anonymous session remains intact; clearing app/browser data loses access to that session.

## Android APK

The native project is in `android/`, with app ID `app.mile234.ride` and a deep-link callback for Google sign-in. Follow [`ANDROID_GO_LIVE_GUIDE.md`](ANDROID_GO_LIVE_GUIDE.md) for SDK setup, a configured APK build, installation, updating, and two-phone testing. The existing APK in the parent folder was built in local mode; a new configured APK is required for shared trips. A debug APK is suitable for a controlled pilot; a release build needs a signing key and release testing.

For the pilot, test sign-in, draft recovery, publishing from one phone, search and request submission on another, driver confirmation, outside-app count transfer, full-trip shared links, cancellation, and weak-connection recovery on real devices before inviting drivers. A full journey is hidden from public search; a driver-shared link can still open it so existing customers can record seats already counted outside the app.

Document images and entered fields are private records. Automatic OCR and authenticity checks are not implemented. A vehicle may be owned, rented, borrowed, or provided by a company.
