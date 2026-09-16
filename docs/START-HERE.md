# What's left, and who has to do it

The app is built, tested, and both build pipelines work. Everything below needs
**your** accounts or your private keys, so nobody else can do it for you.

**Only Session C is still outstanding.** A and B are done and are kept here as the
runbook: what was set up, and how to do it again if the backend is ever rebuilt.

| Session | Time | What it unblocks | State |
| --- | --- | --- | --- |
| **A. Firebase** | ~20 min | The app can sign in and send messages at all | **Done** |
| **B. Android keystore** | ~5 min | APKs that can be upgraded in place | **Done, 15 Sep 2026** |
| **C. Apple** | ~45 min | iPhones, via TestFlight | **Outstanding**, only for iOS |

Commands below are Windows PowerShell 5.1. Each block is one command — copy the whole
block. They all start with a `cd`, so they work from any directory.

---

## Session A: Firebase (done)

The app runs against the real project. `fast-basketball-b3ebe` exists, email sign-in is
on, the database is created, the security rules are deployed carrying Blake's real
account, and `.env` on this machine points at it with no emulator line and no
`.env.local` shadowing it. Signing in through the app against that project was checked on
15 September 2026: a real uid comes back and the "confirm your email" gate behaves.

A1 to A7 below are the record of how that was done, so it can be redone against a new
project. **A8 and A9 are not one-time steps.** They are what you do for each new family,
so read those two whenever you add one.

> **Read the hazard in A6 before you deploy rules again.** `npm run seed` rewrites the
> coach uid in the rules file to a demo value, and deploying after a seed locks Blake out
> of his own app.

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

Going back to the emulator later is just `npm run seed`, which recreates it. Read the
hazard box in A6 first, because that same command edits the rules file. To come back to
your real project afterwards:

```powershell
npm run use-cloud
```

Worth knowing, because it is the most likely thing to confuse you later: `npm run seed`
always writes `.env.local`, and `.env.local` outlives the emulator it points at. Seed
once, stop the emulator, and the app fails to connect on every launch after that. The
seed now says so in red when it shadows a real project, and the sign-in screen says
which backend it is using.

`.env` is gitignored. None of it is secret anyway — a Firebase web config is public by
design, and the security rules are what actually protect the data.

**The release builds need the same file, and cannot read yours.** Expo inlines these
values into the JavaScript bundle at build time, so a build without them produces an app
that installs, opens and dead-ends on "unconfigured". GitHub gets its copy from an
`ENV_FILE` repository secret, which is already set — **re-set it whenever `.env`
changes**, or the next build ships the old backend:

```powershell
gh secret set ENV_FILE --repo shaver3josiah/fast-basketball-app < "C:/Users/shave/Documents/Claude/Projects/Fast Basketball/fast-basketball-app/.env"
```

### A6. Deploy the security rules — the step that matters most

**Already deployed.** The live rules on `fast-basketball-b3ebe` carry Blake's real
account and the consent and parent-monitoring logic is in force. What follows is the
command to run again after you change `firebase/firestore.rules`.

> **Never run this straight after `npm run seed`.** Seeding rewrites `coachUid()` in
> `firebase/firestore.rules` to `coach_demo_uid` for the local demo. Deploying that value
> tells the live project that Blake is a stranger: no threads, no roster, no way back in
> from inside the app. Check the file first, and put the real uid back with
> `git checkout firebase/firestore.rules` before deploying.
>
> ```powershell
> Select-String -Path "C:\Users\shave\Documents\Claude\Projects\Fast Basketball\fast-basketball-app\firebase\firestore.rules" -Pattern "coachUid"
> ```
>
> If that prints `coach_demo_uid` or `REPLACE_WITH_BLAKE_AUTH_UID`, stop and restore the
> file. Deploy only when it prints his real uid.

Run the deploy from this directory. `firebase-tools` is installed here and nowhere else,
and `--config firebase/firebase.json` resolves relative to where you are standing:

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

**Already done.** His account exists and both the live rules and `.env` carry its uid.
Do this again only for a new project, or if his account is ever recreated.

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

### A8. Invite a family, which you do for every new one

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

## Session B — Android signing — **done, 15 September 2026**

The upload keystore exists and the four `ANDROID_*` repository secrets are set from it,
so every APK the pipeline builds is release-signed and can be upgraded in place. The
file, its password and the certificate fingerprint are recorded in
`docs/owner-open-items.md` at the **project root** — not in this repository, which is
public.

**Back that keystore up.** Losing it or its password means no future version of the
Android app can ever update over an installed one, and Play rejects a signature change.
Android has no recovery for this.

## Session C — Apple (only for iPhones)

The click-by-click is [`SHIPPING.md` §2](SHIPPING.md), and everything App Store Connect
asks for once the build is up there — the listing copy, the privacy answers, the age
rating and the review notes — is written out in [`APP-STORE.md`](APP-STORE.md). The short
version, plus the two things that actually go wrong:

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

- **Push notifications.** Nothing on a server can reach a phone: sending a push requires
  server-side code, and Cloud Functions need Firebase's paid Blaze plan. So there is no
  new-message alert. The per-thread mute toggle is built and saves, so the setting is
  ready, but until push exists it governs nothing. The streak reminders on the You tab are
  a different thing and do work: the phone's own clock fires those, with no server
  involved.
- **A signup flow.** Blake creates accounts by hand (A8).
- **Unread badges are approximate.** The Messages badge counts visible threads, not
  unread messages.
- **The Locker is readable by any signed-in account.** Training content rather than
  personal data, but it is Blake's paid material. Closing it needs a membership record,
  which is a business decision nobody has made yet.
- **Under-13 athletes should not have logins.** COPPA attaches below 13. The cheapest
  compliant path is a 13+ age rating with younger families using the parent account
  only. That is your call, not a code change.
