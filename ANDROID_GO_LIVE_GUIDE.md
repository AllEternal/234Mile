# 234Mile Android installation and pilot guide

The web app and Android app use the same screens and Supabase backend. **The APK already provided, `234Mile-Pilot-Debug.apk`, is a local-mode build.** It installs, but it cannot publish or show shared journeys until a new APK is built with your Supabase settings. Complete the [web/backend guide](WEB_GO_LIVE_GUIDE.md) first, then follow this guide. You do not need to publish to Google Play for a small, known-driver pilot.

## 1. Set up the shared backend and sign-in

1. Complete the Supabase SQL scripts, private storage, Google provider, anonymous passenger sign-ins, and web deployment in [WEB_GO_LIVE_GUIDE.md](WEB_GO_LIVE_GUIDE.md). Use **the same Supabase project** for web and Android.
2. In Supabase **Authentication > URL Configuration**, add `app.mile234://auth/callback` to the allowed Redirect URLs. The Android manifest registers this exact deep link, and the app passes it as `redirectTo` when drivers choose Google sign-in. Google's own Authorized redirect URI remains the **Supabase callback URL**, not this Android deep link. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) · [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
3. Test the website's Google sign-in first. Then test the Android round trip on a real phone: tap **Continue with Google**, complete Google sign-in in the browser, and confirm it returns to 234Mile with the driver signed in. Do not distribute the APK until this works.

## 2. Prepare the Windows build computer

1. Open the extracted `app` source folder. Install Node.js 22.12 or newer, JDK 21, and Android SDK Platform 36, Build Tools 36, and Platform Tools. Android Studio's SDK Manager is the easiest way to install and accept the SDK licences. The included `build-android.ps1` can use `.toolchain\jdk21` and `.toolchain\android-sdk` if those folders already exist. Otherwise set `JAVA_HOME` to JDK 21 and `ANDROID_HOME` to your Android SDK directory. [Capacitor Android setup](https://capacitorjs.com/docs/android) · [Android build system](https://developer.android.com/build)
2. In PowerShell, from `app`, run `npm ci`.
3. Copy `.env.example` to `.env` and fill in:

   ```text
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   VITE_PUBLIC_APP_URL=https://YOUR-LIVE-WEB-ORIGIN
   ```

   Use the **publishable/anon** key, never the Supabase secret or service-role key. `VITE_PUBLIC_APP_URL` must be the final HTTPS web origin because Android drivers share trip links that passengers open on the web. `.env` is excluded from Git, but these `VITE_` values are embedded in the compiled app, so they cannot be treated as secrets. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) · [Vite environment variables](https://vite.dev/guide/env-and-mode)

## 3. Build an installable pilot APK

From PowerShell in `app`, run:

```powershell
npm run android:sync
.\android\gradlew.bat -p .\android assembleDebug
```

Or run `powershell -ExecutionPolicy Bypass -File .\build-android.ps1` after `JAVA_HOME` and `ANDROID_HOME` are set. Both routes now use `build:deploy`, which stops if the Supabase URL, publishable key, or public web URL is missing or still a placeholder. Capacitor sync copies the newly built web assets into Android before Gradle packages them. The output is:

```text
app\android\app\build\outputs\apk\debug\app-debug.apk
```

Give this newly built file a versioned name before sharing, for example `234Mile-Pilot-2026-09-17.apk`. **Do not share the older `234Mile-Pilot-Debug.apk` as the live build.** A successful compile only proves that the package builds; the live Supabase and Google flows still need the device checks below.

## 4. Install it on pilot phones

Send the new APK only to your chosen drivers and passengers through a trusted channel. On each Android phone, open the APK from Files/Downloads and allow installation from that source if Android requests it. Alternatively, with USB debugging enabled and Android Platform Tools installed, run `adb install -r "PATH-TO-APK"` from your computer. The phone needs Android 7.0 (API 24) or newer. [Android device setup](https://developer.android.com/studio/run/device) · [Android app signing](https://developer.android.com/studio/publish/app-signing)

If Android refuses to update an existing 234Mile installation with a **signature mismatch**, uninstall the old debug build and install the new one. Uninstalling clears local drafts and the passenger's anonymous session/status on that device, so notify testers first. For repeatable updates, build with the same signing key. The current Gradle project has no release signing configuration; debug APKs are appropriate for a supervised pilot, but public/store distribution needs a release key and release testing. [Android app signing](https://developer.android.com/studio/publish/app-signing)

## 5. Confirm the two apps really work together

Use two phones, ideally on different mobile connections:

1. Driver signs in with Google on Android, completes the profile, adds a vehicle, and publishes a four-seat trip.
2. Passenger finds that trip on Android or the website, calls or messages the driver, and sends an in-app seat request. The request must say **Pending driver confirmation**.
3. Driver sees the passenger's request and confirms it. Passenger refreshes on the same device and sees **Booked**. Test declining another request.
4. Driver counts a customer arranged outside the app; that customer submits a request; driver confirms it as **Already in outside-app count**. The remaining-seat number must not decrease twice.
5. Fill the trip. It should disappear from public search, show **Full** to the driver, and still open from the driver's shared web link for an existing customer. Cancel a booking and confirm the trip returns to search when a seat opens.
6. Turn off mobile data briefly. Cached listings/drafts may appear with an offline/stale label; publishing, requests, confirmations, and seat changes must wait for a successful online response. Test with weak mobile coverage as well as Wi-Fi.

The app's data is shared through Supabase, not copied directly between phones. If one phone can only see its own draft or shows **Local mode · Supabase setup needed**, it has an old or incorrectly configured build.

## Updates and public release

Every time web code or `.env` changes, rebuild and redistribute the APK. Updating the website alone does **not** update installed Android web assets. Keep the same app ID (`app.mile234.ride`) and signing key for in-place updates; increase `versionCode` and `versionName` in `android/app/build.gradle` for each version you distribute. [Android versioning](https://developer.android.com/studio/publish/versioning)

For this known-tester pilot, a debug APK is the fastest route. For wider distribution, create and safeguard a release signing key, generate a signed release APK or Android App Bundle, and use Google Play testing/distribution when ready. The current project has no release signing setup and its live Android sign-in/booking flow has not been verified against your Supabase project. [Android release preparation](https://developer.android.com/studio/publish/preparing) · [Android app signing](https://developer.android.com/studio/publish/app-signing)
