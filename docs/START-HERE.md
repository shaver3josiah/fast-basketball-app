# What's left, and who has to do it

The app is built, tested, and both build pipelines work. Everything below needs
**your** accounts or your private keys, so nobody else can do it for you.

Three sessions. **Only Session A is required to have a working app** — B and C are
about getting it onto other people's phones properly.

| Session | Time | What it unblocks | Required? |
| --- | --- | --- | --- |
| **A. Firebase** | ~20 min | The app can sign in and send messages at all | **Yes** |
| **B. Android keystore** | ~5 min | APKs that can be upgraded in place | Before real testers |
| **C. Apple** | ~45 min | iPhones, via TestFlight | Only for iOS |

Do **A before C**. There is no point putting a build on an iPhone before it has a
backend to sign in against.

Commands below are Windows PowerShell 5.1. Each block is one command — copy the whole
block. They all start with a `cd`, so they work from any directory.

---

## Session A — Firebase (required)

Right now the app runs against a local emulator on this machine. A phone cannot reach
that. This gives it a real backend.

### A1. Create the project

[console.firebase.google.com](https://console.firebase.google.com) → **Add project** →
name it `fast-basketball`. Analytics can be off.

> Already done — the project is **`fast-basketball-b3ebe`** (Firebase appends a suffix
> to make the id globally unique). That full id is what the deploy commands below use.

### A2. Turn on email sign-in

**Build → Authentication → Get started → Email/Password → Enable → Save.**

### A3. Create the database

**Build → Firestore Database → Create database** → **Start in production mode** →
location **`nam5 (us-central)`**.

Production mode denies every read and write by default. That is correct — the real
rules go on in A6.

### A4. Register the app and copy the config

**Project settings (gear icon) → Your apps → Web (`</>`)** → nickname
`fast-basketball-app` → Register.

Firebase shows a `firebaseConfig` block with six values. Leave the page open.

### A5. Put the config in `.env`

```powershell
Copy-Item "C:\Users\shave\Documents\Claude\Projects\Fast Basketball\fast-basketball-app\.env.example" "C:\Users\shave\Documents\Claude\Projects\Fast Basketball\fast-basketball-app\.env"
```

Open that `.env`, comment out the two emulator lines at the top, and paste your six
values into the `EXPO_PUBLIC_FIREBASE_*` slots.

**Then delete `.env.local` if it exists.** `npm run seed` writes that file to point the
app at the local emulator, and Expo loads `.env.local` at a HIGHER precedence than
`.env` — so leaving it in place means your real project is read, ignored, and the app
quietly keeps talking to an emulator that is not even running:

```powershell
Remove-Item "C:\Users\shave\Documents\Claude\Projects\Fast Basketball\fast-basketball-app\.env.local" -ErrorAction SilentlyContinue
```

Going back to the emulator later is just `npm run seed`, which recreates it.

`.env` is gitignored. None of it is secret anyway — a Firebase web config is public by
design, and the security rules are what actually protect the data.

### A6. Deploy the security rules — the step that matters most

Until this runs, your database denies everything and none of the consent or
parent-monitoring logic is in force. The rules exist and are tested, but a copy in a
repository protects nobody.

```powershell
cd "C:\Users\shave\Documents\Claude\Projects\Fast Basketball\fast-basketball-app"
```

```powershell
npx firebase login
```

```powershell
npx firebase deploy --only firestore:rules --project fast-basketball-b3ebe --config firebase/firebase.json
```

### A7. Create Blake's account and point the rules at it

**Authentication → Users → Add user.** Enter his email and a password. Copy the
**User UID** that appears in the table.

```powershell
node "C:\Users\shave\Documents\Claude\Projects\Fast Basketball\fast-basketball-app\scripts\set-coach-uid.mjs" PASTE_THE_UID_HERE
```

Put the same UID in `.env` as `EXPO_PUBLIC_COACH_UID`, then run the A6 deploy command
once more so the rules pick up the change.

**If those two values disagree, Blake is treated as a stranger by his own app** — he
sees no threads and no roster. That is exactly why there is a script instead of a
hand-edit.

### A8. Invite the first family

Do this **in the app**, not in the Firebase console. Sign in as Blake, go to the
**You** tab, and tap **Add or manage athletes**.

Fill in the athlete's name and age, the parent's name and email, and the athlete's
email. Tap **Add athlete**.

> **Under 13:** leave the athlete's email blank. They get no login and the family shares
> the parent's account. COPPA attaches below 13, and this is the cheapest compliant
> path.

The roster then shows each person as **Invited** until they sign up, and **Signed up**
once they have. When the parent has an account, an **Open threads** button appears —
tap it and the conversations are created with the right people in them.

That button waits on purpose. Threads are permanent once created, and the parent's
account has to exist before she can be written into the readers list that makes the
coach↔athlete conversation visible to her. Opening them early would produce a thread
she could never be added to.

### A9. What the family does

1. Open the app, tap **New here? Create your account**.
2. Sign up with **the same address Blake put on the athlete record**. A different
   address creates an account that matches no invitation, and the app says so plainly
   rather than showing an empty screen.
3. Open the confirmation email and click the link.
4. Sign in. The app attaches them to their athlete automatically.

Confirming the address is not optional politeness — it is the security of the whole
step. Without it, anyone who knew a client's email could claim their place and read a
minor's conversation.

---

## Session B — Android signing (do before real testers)

Today's APK is **debug-signed**. It installs and runs, but a properly signed build
later **cannot upgrade over it** — Android rejects the signature change and every
tester has to uninstall first. Five minutes now avoids that conversation.

```powershell
& "C:\Program Files\Java\jdk-17\bin\keytool.exe" -genkeypair -v -keystore "$HOME\fast-basketball-upload.jks" -alias fast-basketball -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a password, then some name and organisation fields — any answers are fine.

> **Save that password somewhere permanent, and keep the `.jks` file.** Losing either
> means you can never update the app again; Android has no recovery for this. Do not
> put the file in the repo — `.gitignore` already blocks `*.jks`, but keep it
> elsewhere anyway.

```powershell
gh secret set ANDROID_KEYSTORE_BASE64 --repo shaver3josiah/fast-basketball-app --body ([Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\fast-basketball-upload.jks")))
```

```powershell
gh secret set ANDROID_KEY_ALIAS --repo shaver3josiah/fast-basketball-app --body "fast-basketball"
```

Then set `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD` to the password you
chose — the same value for both.

Full detail: [`SHIPPING.md` §3](SHIPPING.md).

---

## Session C — Apple (only for iPhones)

The click-by-click is [`SHIPPING.md` §2](SHIPPING.md). The short version, plus the two
things that actually go wrong:

1. **developer.apple.com — accept any pending agreement first.** A pending agreement
   breaks distribution silently, deep inside a build, with an error that does not
   mention agreements.
2. Register the bundle ID **`com.fastbasketball.app`**. It must match `app.json`
   exactly.
3. App Store Connect → **Apps → + → New App**, using that bundle ID.
4. **Users and Access → Integrations → App Store Connect API → Team Keys → +.**
   Set **Access = App Manager** (Admin on an organisation team).
   **Not Developer.** A Developer key archives fine and then fails at export with
   `Cloud signing permission error` — a 20-minute round trip to discover.
   **Download the `.p8` immediately.** Apple offers it exactly once.
5. **TestFlight → Internal Testing** — add yourself and Blake.

Then four secrets. The `.p8` goes in **raw**; base64 gives `invalidPEMDocument`:

```powershell
Get-Content "C:\Users\shave\Downloads\AuthKey_XXXXXXXXXX.p8" -Raw | gh secret set ASC_KEY_P8 --repo shaver3josiah/fast-basketball-app
```

Then `APPLE_TEAM_ID`, `ASC_KEY_ID` and `ASC_ISSUER_ID` the same way, with
`--body "the-value"`.

---

## Shipping, once the above is done

```powershell
cd "C:\Users\shave\Documents\Claude\Projects\Fast Basketball\fast-basketball-app"
```

```powershell
.\scripts\Ship.ps1
```

It checks your secrets are actually present before it tags anything, bumps the version,
and fires both builds. The Android APK lands on the GitHub release; the iOS build
appears in TestFlight after Apple finishes processing.

---

## Two housekeeping items

**Commit a `Gemfile.lock`.** Ruby is not installed on this machine, so one could not be
generated here, and hand-writing a dependency graph would be worse than having none.
The next TestFlight run uploads the one bundler resolves as an artifact — download it
from the run's **Artifacts** section, drop it in the repo root, and commit it. Releases
then stop re-resolving fastlane every time. The upload step disables itself once the
file is committed.

**The 90-day TestFlight clock.** A TestFlight build stops being installable 90 days
after upload, with no warning to anyone. A monthly job already re-uploads to prevent
that — see [`SHIPPING.md` §5b](SHIPPING.md). You do not have to do anything, but if
that job ever starts failing, fix it rather than muting it: the consequence is silent
and it lands on the families, not on you.

---

## What is deliberately not built

Stated plainly so none of it is a surprise later:

- **Push notifications.** Sending one requires server-side code, and Cloud Functions
  need Firebase's paid Blaze plan. The per-thread mute toggle is built and saves, so
  the setting is ready — but until push exists it governs nothing.
- **A signup flow.** Blake creates accounts by hand (A8).
- **Unread badges are approximate.** The Messages badge counts visible threads, not
  unread messages.
- **The Locker is readable by any signed-in account.** Training content rather than
  personal data, but it is Blake's paid material. Closing it needs a membership record,
  which is a business decision nobody has made yet.
- **Under-13 athletes should not have logins.** COPPA attaches below 13. The cheapest
  compliant path is a 13+ age rating with younger families using the parent account
  only. That is your call, not a code change.
