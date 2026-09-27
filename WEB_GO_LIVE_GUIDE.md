# 234Mile web app: go-live guide

This guide is for the current controlled pilot. The web app is a Vite static site; Supabase supplies the shared database and sign-in. Hosting the existing `dist/` alone will publish **local mode**, because the project has no configured `.env` yet. The existing debug APK is also local-mode and must be rebuilt after adding the same Supabase configuration.

## Recommended setup

Use one private GitHub repository containing the contents of this `app` folder, a Git-connected **Cloudflare Pages** project for the web app, and one **Supabase** project for the pilot backend. This keeps the current lightweight architecture while making web updates repeatable. Cloudflare Pages builds on each push to the production branch; no Node server is needed to serve the finished Vite site. [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) · [Vite build settings](https://developers.cloudflare.com/pages/configuration/build-configuration/)

Choose the permanent web address first. A `*.pages.dev` address is sufficient for a small pilot; use your own domain before sharing many trip links if you intend to keep it long-term. Driver-shared links and Google sign-in use the web origin, so changing domains later requires updating configuration and sharing fresh links. [Cloudflare Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)

## 1. Prepare the project

1. Open `C:\Users\Mercy and Grace\OneDrive\Documents\ChatGPT\234Mile\app`, or extract `234Mile-Seat-Booking-Source.zip` to a clean folder. Put **the contents of `app` at the root** of a private GitHub repository. Do not upload `node_modules`, `dist`, `.toolchain`, `.env`, or APK files; `.gitignore` excludes them.
2. Use Node.js 22.12 or newer locally. Run `npm ci` and `npm run build` to check the project. The ordinary build can run in local mode; the cloud deployment must use `npm run build:deploy`, which fails if the three deployment settings are missing. [Vite Node requirement](https://vite.dev/guide/)
3. Decide the final address, for example `https://234mile.pages.dev` or `https://ride.example.ng`. Use the exact HTTPS **origin**, without an app path, for `VITE_PUBLIC_APP_URL` and Supabase's web redirect setting.

## 2. Create the Supabase backend

1. Create a Supabase project. Save its **Project URL** and **publishable key** (or legacy anon key). Never put the service-role/secret key in the web app.
2. For a new project, run `supabase/schema.sql` in the Supabase SQL Editor, then run `supabase/002_seat_booking.sql` **once**. If `schema.sql` was already applied to this project, back up the database and run only the second script. Do not run the old ZIP's `supabase-setup.sql`; its policies are not for this app.
3. Check that the SQL editor reports success and inspect Database > Policies and Storage. `driver-documents` must be a private bucket; driver profiles, vehicles, documents, offers, and seat requests must have row-level security. Run Supabase's Security Advisor. [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
4. In Authentication, enable **anonymous sign-ins** for passengers and **Google** for drivers. Anonymous passengers retain request status only while their browser/app session remains on that device. [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)

## 3. Configure Google sign-in

1. In Google Cloud's Auth Platform, set up an **External** audience and a **Web application** OAuth client. For a controlled test, add your driver testers if Google requests test users. Use only the basic identity scopes needed by the app. [Google OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
2. In that Google OAuth client, add your web origin (for example `https://234mile.pages.dev`) to **Authorized JavaScript origins**. Add the **Supabase callback URL** shown on Supabase's Google provider page to **Authorized redirect URIs**. Do not enter the Pages URL as Google's redirect URI. Paste the Google client ID and secret into Supabase's Google provider settings. [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
3. In Supabase Authentication > URL Configuration, set **Site URL** to the final web origin. Add that exact origin to **Redirect URLs**, because the current web code uses `redirectTo: location.origin`. Keep `app.mile234://auth/callback` in the allow list if you will rebuild and test the Android app against this project. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

## 4. Publish the web app with Cloudflare Pages

1. In Cloudflare, open **Workers & Pages > Create application > Pages > Connect to Git**. Select the private repository and its production branch, usually `main`. Cloudflare supports private GitHub repositories. [Pages Git setup](https://developers.cloudflare.com/pages/get-started/git-integration/)
2. If the repository root contains `package.json`, leave **Root directory** blank. If the repository contains a larger folder tree, set Root directory to the path of this `app` folder.
3. Set **Build command** to `npm run build:deploy` and **Build output directory** to `dist`. Use the current Pages build image with Node.js 22 or set `NODE_VERSION=22.16.0`. [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) · [Pages build image](https://developers.cloudflare.com/pages/configuration/build-image/)
4. Under **Settings > Environment variables**, set these for the production build:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Your Supabase Project URL, such as `https://PROJECT.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase publishable/anon key, **not** a service-role key |
   | `VITE_PUBLIC_APP_URL` | Your final HTTPS web origin, such as `https://234mile.pages.dev` |

5. Deploy. If Pages assigned a different `*.pages.dev` hostname than expected, correct `VITE_PUBLIC_APP_URL` and the Supabase/Google web origins, then redeploy before sharing links. Opening the site should no longer show **“Local mode · Supabase setup needed.”** Pages supplies HTTPS and serves this app's root page; no extra web server or SPA rewrite is needed for its current root/query-string URLs. [Pages serving behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)

For a one-off preview, Cloudflare Direct Upload can host a locally built `dist/`, but Git integration is the better path for repeated pilot changes. Build variables must be set **before** Vite builds; changing them in a dashboard does not alter a previously built bundle. [Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) · [Vite env variables](https://vite.dev/guide/env-and-mode)

## 5. Test before inviting drivers and passengers

Use two different devices or private browser profiles:

1. Driver: sign in with Google, save profile and vehicle, publish a trip with four seats, and verify it appears on the second device.
2. Passenger: call or WhatsApp the driver, then submit a seat request. Verify it says **Pending driver confirmation**, not Booked.
3. Driver: confirm the request; passenger refreshes status and sees **Booked**. Repeat with an outside-app seat and choose **Already in outside-app count** to ensure the seat is not counted twice.
4. Fill all seats. Confirm the trip disappears from public search, remains **Full** in driver management, and opens through the driver's unlisted trip link. Check cancellation and seat release.
5. Repeat after temporarily losing internet: cached information must be labelled stale, and seat-changing actions must wait for a server response. Check a phone browser's Add to Home Screen flow if web installation matters to the pilot.
6. Check Supabase Auth/Database logs and the Pages deployment for errors. If the web build is wrong, roll back to a previous Pages deployment; a frontend rollback **does not undo the SQL migration**. For an existing database, keep a backup before migration. [Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/) · [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)

## Current limits and go-live decision

- **Controlled pilot:** The architecture is appropriate. Use Pages + Supabase, test the complete two-device flow, and monitor the first users closely. The SQL migration and live booking flow have not yet been exercised against your Supabase project.
- **Before broad public launch:** Add a CAPTCHA/Turnstile token to the app's anonymous sign-in. Supabase recommends CAPTCHA for anonymous sign-ins, but the current `signInAnonymously()` call sends no token; enabling Supabase CAPTCHA now would block first-time passenger requests. Until that code is added and tested, keep distribution limited to known testers and monitor Auth rate limits and suspicious requests. [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous) · [Supabase CAPTCHA setup](https://supabase.com/docs/guides/auth/auth-captcha)
- **Reliability:** Supabase can pause low-activity Free Plan projects after seven days, and the Free Plan has limited backup options. Free is reasonable for supervised testing; choose a paid plan and a backup routine when real journeys depend on uninterrupted service. [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) · [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- **Android:** The current `234Mile-Pilot-Debug.apk` was built without a Supabase `.env`. It cannot share live rides or bookings. Once the web backend is configured, follow [the Android go-live guide](ANDROID_GO_LIVE_GUIDE.md) to rebuild and redistribute the APK with the same Supabase URL/key and final `VITE_PUBLIC_APP_URL`, then test Google sign-in and passenger requests on Android separately.
- **Driver documents:** The app stores supplied records but does not verify document authenticity. Before collecting real identity documents outside a supervised pilot, provide clear privacy information, restrict who can administer the Supabase project, and decide how long records are kept.
