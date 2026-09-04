# Shipping Fast Basketball

One `git tag` produces both binaries:

| Tag pushed | What happens | Where it lands |
| --- | --- | --- |
| `v1.0.1` | `android-apk.yml` builds and signs an APK | GitHub **Releases**, download to any Android phone |
| `v1.0.1` | `ios-testflight.yml` builds, signs, uploads | **TestFlight**, install on any iPhone |

Both binaries are the same JavaScript against the same Firebase project, so an
iPhone and an Android phone message each other with no extra work.

Everything runs on GitHub's own machines, including the Mac. Because this repo is
public, those minutes are free, and no Expo/EAS account or build credits are used.

---

## 1. What only you can do

These need your Apple account or your private keys. Nobody can do them for you.

- Enrol in the Apple Developer Program ($99/year).
- Create the App ID and the app record in App Store Connect.
- Create the App Store Connect API key, and download the `.p8`, which is offered
  **once**.
- Accept the App Store Connect agreements.
- Add TestFlight testers.
- Generate the Android upload keystore (it is your signing identity).
- Paste all eight values into GitHub as repository secrets.

Everything after that is automatic.

---

## 2. Apple setup (one time)

### 2.1 Enrol

<https://developer.apple.com/programs/> - $99/year. Wait for approval before
continuing; the steps below do not exist until you are enrolled.

### 2.2 Register the bundle ID

<https://developer.apple.com/account/resources/identifiers> then **+** then App IDs
then App.

- Description: `Fast Basketball`
- Bundle ID: **Explicit**, set to `com.fastbasketball.app`

This string must match `ios.bundleIdentifier` in `app.json` exactly. It is already
set to `com.fastbasketball.app` there, so use that unless you change both.

### 2.3 Create the app record

<https://appstoreconnect.apple.com/apps> then **+** then New App.

- Platform: iOS
- Name: `Fast Basketball`. This must be unique across the entire App Store. If it
  is taken, pick something else here; the name on the phone comes from `app.json`,
  not from this field.
- Bundle ID: the one from 2.2
- SKU: anything, e.g. `fast-basketball`

### 2.4 Accept the agreements

App Store Connect then **Business** (older name: Agreements, Tax, and Banking).
Accept the free-apps agreement. **Uploads are rejected until this is done**, with an
error message that never mentions agreements.

### 2.5 Create the API key, and watch the role

<https://appstoreconnect.apple.com/access/integrations/api> then the **Team Keys**
tab then **+**.

- Name: `GitHub Actions`
- Access: **App Manager**. Admin also works.

> **This is the most common failure in this whole pipeline.** A key with the
> **Developer** role archives perfectly, then fails minutes later at the export
> step with `Cloud signing permission error`. If you see that message, the role is
> wrong. Roles cannot be edited after creation, so revoke the key and make a new
> one.

Then:

1. **Download the `.p8`.** Apple lets you download it exactly once.
2. Note the **Key ID**, 10 characters, shown in the row.
3. Note the **Issuer ID**, a UUID shown above the table. It is the same for every
   key on the team.

### 2.6 Add yourself as a TestFlight tester

App Store Connect then your app then **TestFlight** then Internal Testing. Create a
group and add your Apple ID. Internal testers need no review and get the build
within a few minutes of upload.

---

## 3. Android keystore (one time, on Windows)

The keystore is your app's permanent identity. **If you lose it you cannot ship an
update that installs over the old app**, because Android refuses a signature
change. Back it up somewhere you will still have it in five years.

`keytool` ships with the JDK. If the command is not found, install Temurin JDK 17
from <https://adoptium.net/> and reopen PowerShell.

Generate the keystore. It prompts for a password, and for your name and
organisation, which can be anything:

```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore fast-basketball-upload.jks -alias fast-basketball -keyalg RSA -keysize 2048 -validity 10000
```

Use the **same password** for the store and for the key. A PKCS12 keystore really
only has one password, and setting two different ones is a reliable way to get a
build that fails to sign for no visible reason.

Now turn it into text you can paste into a GitHub secret:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("fast-basketball-upload.jks")) | Set-Clipboard
```

That puts the whole base64 blob on your clipboard, ready to paste as
`ANDROID_KEYSTORE_BASE64`.

> Do **not** use `certutil -encode` for this. It wraps its output in
> `-----BEGIN CERTIFICATE-----` header and footer lines, and the workflow's
> `base64 -d` chokes on them.

If you would rather write it to a file than use the clipboard:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("fast-basketball-upload.jks")) | Set-Content -Encoding ascii keystore.base64.txt
```

Keep `fast-basketball-upload.jks` and `keystore.base64.txt` **out of the repo**.
`.gitignore` already excludes `*.jks`.

---

## 4. The eight secrets

GitHub, then your repo, then **Settings**, then Secrets and variables, then
**Actions**, then New repository secret.

| Secret | Used by | Value |
| --- | --- | --- |
| `APPLE_TEAM_ID` | iOS | 10-character Team ID, top right of <https://developer.apple.com/account> |
| `ASC_KEY_ID` | iOS | 10-character Key ID from step 2.5 |
| `ASC_ISSUER_ID` | iOS | Issuer ID (UUID) from step 2.5 |
| `ASC_KEY_P8` | iOS | **Raw contents** of the `.p8` file, see below |
| `ANDROID_KEYSTORE_BASE64` | Android | The base64 blob from step 3 |
| `ANDROID_KEYSTORE_PASSWORD` | Android | The keystore password you chose |
| `ANDROID_KEY_ALIAS` | Android | `fast-basketball` |
| `ANDROID_KEY_PASSWORD` | Android | Same as the keystore password |

### `ASC_KEY_P8`: paste it raw

Open the downloaded `AuthKey_XXXXXXXXXX.p8` in Notepad, select all, copy, paste. It
must include the first and last lines, like this:

```
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----
```

**Do not base64-encode it.** The workflow writes this value straight to disk with
`echo`. An encoded key produces `invalidPEMDocument` from Apple's crypto library
later in the run.

### The Android secrets are optional at first

If the four `ANDROID_*` secrets are missing, the Android job still runs and still
gives you a working, installable `.apk`. It is just debug-signed, and the run
summary says so in large letters. That is deliberate: getting the app onto a phone
should not have to wait on keystore paperwork.

A debug-signed APK installs and runs, but it cannot go to Google Play, and a later
release-signed APK will not upgrade over it. You would have to uninstall first.

---

## 5. Releasing

From the project folder in PowerShell:

```powershell
.\scripts\Ship.ps1
```

That commits everything, pushes, tags the next patch version, and pushes the tag,
which starts both release builds. To choose the version yourself:

```powershell
.\scripts\Ship.ps1 -Version 1.2.0 -Message "New drill screen"
```

Then watch **Actions** in GitHub. Roughly:

- Android: about 10 minutes, then the `.apk` appears on the Releases page and as a
  workflow artifact.
- iOS: about 20 minutes, then the build appears in App Store Connect under
  TestFlight, followed by a few more minutes of Apple-side processing before
  testers are notified.

### Installing the APK on a phone

Open the Releases page on the Android phone, download the `.apk`, tap it, and allow
"install unknown apps" for your browser when prompted.

### Running one platform on its own

Actions, then pick **Android APK** or **iOS TestFlight**, then **Run workflow**.
This builds without creating a tag or a release.

---

## 6. When something breaks

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cloud signing permission error` at the export step | API key has the Developer role | Revoke it, create a new key with **App Manager**, step 2.5 |
| `invalidPEMDocument` | `ASC_KEY_P8` was base64-encoded | Re-paste the raw file contents |
| Upload rejected, message mentions contracts | Agreements not accepted | Step 2.4 |
| `Project must have a 'ios.bundleIdentifier' set` | `app.json` was edited | Restore `ios.bundleIdentifier` and `android.package` |
| Android build succeeds, APK will not install over the old one | Signature changed, debug to release or a new keystore | Uninstall the old app first |
| `No profiles were found` | Bundle ID in `app.json` does not match the App ID | Make step 2.2 and `app.json` agree |
| iOS build number rejected as duplicate | Two runs produced the same build number | Push a new tag; the build number is the GitHub run number |

Version numbers: the user-visible version comes from `expo.version` in `app.json`.
The build number is the GitHub run number, so it always increases on its own and
you never need to bump it by hand.
