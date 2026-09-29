# 234Mile pilot access and distribution guide

Updated 28 September 2026.

## What is already online

| Part | Current location | Purpose |
| --- | --- | --- |
| Frontend source | `https://github.com/AllEternal/234Mile`, branch `pilot-revamp` | Version history and automatic deployments |
| Web hosting | `https://234mile.site` | Public passenger and driver web app |
| Backend | Supabase project `tolipwgukxfgtatunpoc` | Database, authentication, storage, row-level security, and booking functions |
| Android package | `C:\Users\Mercy and Grace\OneDrive\Documents\ChatGPT\234Mile\234Mile-Live-Pilot.apk` | Installable controlled-pilot app |

The frontend does not run from GitHub or Supabase. GitHub stores the source. Cloudflare builds the source and hosts the website. The browser and Android app communicate with Supabase for shared journeys, accounts, documents, and seat requests.

## 1. Give people access to the web app

1. Share this exact link: `https://234mile.site`.
2. A passenger can open the link in Chrome, Edge, Safari, or another current browser. No passenger account is required to browse journeys.
3. A driver opens **Offer a ride**, selects **Continue with Google**, completes the driver profile and vehicle details, and then publishes a journey.
4. While the Google OAuth app remains in Testing status, each driver's Google email address must first be added in Google Cloud Console under **Google Auth Platform > Audience > Test users**. Google currently allows up to 100 test users for this testing state.
5. To place the web app on an Android home screen, open it in Chrome, open the three-dot menu, and choose **Add to Home screen** or **Install app**. The wording depends on the phone and Chrome version.
6. On iPhone, open the site in Safari, tap **Share**, then **Add to Home Screen**.

If the page does not open, first try another mobile network or Wi-Fi connection. If it opens but shows no journeys, that normally means no driver has published a future journey with remaining seats.

## 2. Upload the APK to Google Drive

Google Drive is the simplest distribution method for a small, known group of testers.

1. On the computer, locate `C:\Users\Mercy and Grace\OneDrive\Documents\ChatGPT\234Mile\234Mile-Live-Pilot.apk`.
2. Sign in at `https://drive.google.com` using the Google account that will manage pilot files.
3. Create a folder named **234Mile Pilot Releases**.
4. Open the folder and select **New > File upload**.
5. Choose `234Mile-Live-Pilot.apk` and wait until the upload completes.
6. Right-click the uploaded APK and choose **Share**.
7. Under **General access**, choose **Anyone with the link** and keep the role as **Viewer**.
8. Select **Copy link**. Send that link only to the selected drivers and passengers during the controlled pilot.
9. In the message accompanying the link, state the release date and ask testers to report their phone model, Android version, screen recording or screenshot, and the action they were performing if an error occurs.

Do not upload the `signing` folder or `234mile-pilot.keystore`. The signing key must remain private because it authorizes future Android updates.

## 3. Install the APK on an Android phone

1. Open the shared Google Drive link on the Android phone.
2. Tap **Download**. Google Drive or Chrome may warn that APK files can be harmful because the file is outside Google Play. Confirm only if the link came directly from the 234Mile pilot administrator.
3. Open the downloaded file from the notification or the phone's **Files > Downloads** folder.
4. If Android blocks the installation, tap **Settings** on the prompt and enable **Allow from this source** for Drive, Chrome, or Files. Return to the installer.
5. Tap **Install**, wait for completion, then tap **Open**.
6. After installation, return to the same security setting and disable **Allow from this source** if the tester does not normally install APK files.
7. The phone must run Android 7.0 or later and have internet access for publishing, booking requests, confirmations, seat changes, and cancellations.

If an older 234Mile APK is already installed and Android reports an incompatible signature, uninstall the older copy and install this current build. Uninstalling clears drafts and passenger request status stored on that phone. Starting with this release, keep and reuse the retained pilot signing key so future APK versions can update in place.

## 4. First-use checklist for drivers

1. Confirm the driver's Google email is listed as a Google OAuth test user.
2. Install the APK or open the web app.
3. Open **Offer a ride** and select **Continue with Google**.
4. Complete the driver name, Nigerian phone number, and vehicle details.
5. Create a test journey at least one day in the future. Leave the passenger capacity at four for a normal sedan or change it for a larger vehicle.
6. Enter the driver's own price per seat. 234Mile does not add a fee or collect payment in this pilot.
7. Publish the journey and copy its unlisted trip link.
8. Confirm that a second phone can find the journey in public search.

## 5. First-use checklist for passengers

1. Open the website or install the APK. Passenger browsing does not require visible registration.
2. Search for the origin, destination, and travel date.
3. Open a journey and contact the driver by call or WhatsApp.
4. After agreeing with the driver, use **I've arranged seats with this driver** and enter the passenger name, phone number, and seat quantity.
5. Confirm that the request says **Pending driver confirmation**.
6. After the driver confirms it, use **Refresh request status** and verify that it says **Booked**.
7. Keep the browser or app data on that device. Clearing it removes the anonymous passenger session used to retrieve the request status.

## 6. Required two-phone pilot test

Run this before inviting a larger group:

1. Driver publishes a four-seat trip.
2. Passenger finds it and requests one seat.
3. Driver confirms the request; passenger sees **Booked**.
4. Driver records one outside-app customer.
5. That customer submits a request through the shared trip link; driver confirms it as **Already in outside-app count**. Availability must not fall twice.
6. Fill every seat. The trip must disappear from public search and remain **Full** in the driver dashboard.
7. Open the driver's unlisted link while full and confirm it still displays the journey.
8. Cancel one confirmed booking. The released seat must make the trip searchable again.
9. Test briefly with mobile data disabled. Cached information may display, but seat-changing actions must require a successful connection.

Record each test with the phone model, Android version, user role, action, result, and time. Do not use an important real journey for the first test cycle.

## 7. Publish an updated website

1. Make and test the source change in the Git checkout.
2. Run `npm run build:deploy`.
3. Commit the change to branch `pilot-revamp` and push it to `https://github.com/AllEternal/234Mile.git`.
4. Cloudflare automatically builds the branch. Wait until the deployment shows **Success** and 100% production traffic.
5. Open `https://234mile.site` in a private browser window and test the affected flow.

Changing the GitHub source does not move or replace the Supabase database. The deployed frontend continues using the existing Supabase project unless its environment configuration is deliberately changed.

## 8. Publish an updated APK

1. Increase Android `versionCode` and `versionName` before every distributed update.
2. Build the web assets with the production Supabase configuration.
3. Synchronize the assets into Android and produce a signed APK.
4. Sign every update with the same retained key in the local `signing` folder.
5. Verify the APK signature and package ID `app.mile234.ride`.
6. Give the file a versioned name, for example `234Mile-Pilot-1.0.1.apk`.
7. Upload it to **234Mile Pilot Releases** in Google Drive. Keep older versions in an **Archive** subfolder rather than replacing them without a record.
8. Test installation as an update over the previous APK before sharing it.

Website updates do not automatically update the APK because the installed Android app contains a bundled copy of the frontend.

## 9. When to use Google Play

Google Drive is appropriate for the small supervised pilot. Use Google Play when distribution expands or when testers should receive automatic updates.

For Google Play, first create a protected production signing process and build a signed Android App Bundle (`.aab`). Create a Google Play Console developer account, create the 234Mile app using package ID `app.mile234.ride`, complete the store listing, privacy policy, data-safety declaration, content rating, and app-access instructions, then upload the bundle to **Internal testing**. Add tester email addresses or a Google Group and share the Play testing link. Complete internal testing before closed or production release.

The current APK is suitable for direct controlled-pilot distribution. It is not yet a Play Store production package.

## 10. Current safety checks

- Live web URL: `https://234mile.site`
- APK SHA-256: `2B94A24142006D700ED13B120617499C12443D8ABE3B8496D707461B0B282D6F`
- Android package ID: `app.mile234.ride`
- Minimum Android version: Android 7.0 / API 24
- Target Android API: 36
- Google driver sign-in: live test passed
- Passenger anonymous sessions: enabled
- Supabase seat-booking migration: applied

Keep distribution limited to known testers until the complete two-device seat workflow, weak-network behavior, and multiple phone models have passed field testing.
