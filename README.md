# Fast Basketball — coach ↔ parent ↔ athlete app

A private messaging, scheduling, and training-workflow app for [FAST Basketball](https://github.com/shaver3josiah/fast-basketball-site)
(Blake Kingsley, North Broward County FL). One React Native codebase produces the iOS
build and the Android `.apk`, and both talk to the same Firebase project — so a message
typed on an iPhone lands on an Android phone, and the other way round, with no bridge
code in between.

Separate from the marketing site. Same brand, different product.

---

## The three roles

| Role | Sees | Can do |
|---|---|---|
| **Coach** | every thread, the roster's calendar, the Locker | message, schedule, publish HTML workflows |
| **Parent** | their own thread with the coach **and** the full coach↔athlete thread | message the coach, grant or revoke consent, mute notifications |
| **Athlete** | their own thread with the coach, their calendar, the Locker | ask questions and save workflows — **only after a parent grants consent** |

Two guarantees hold the product together, and both are enforced by
[Firestore Security Rules](firebase/firestore.rules) rather than by the UI:

1. **Consent gate.** An athlete's thread is read-only until their guardian grants
   consent. Revoking it re-locks the thread immediately without deleting anything.
2. **Parent monitoring.** The guardian's uid is on the coach↔athlete thread's `readers`
   array from creation and cannot be removed — threads are immutable, and messages can
   never be edited or deleted by anyone, the coach included. The athlete is *told* this
   in a visible banner. Silent surveillance of a minor is both an ethics problem and an
   App Review problem.

The UI mirrors those rules; it does not implement them. A modified client gets the same
answer, because the check runs on Google's servers.

---

## Run it locally

Needs Node 22.13+ (Expo SDK 57's floor) and, for the Firebase emulator, **JDK 21+**
(current `firebase-tools` refuses to start on Java 17).

```bash
npm install
```

Copy the env file:

```bash
cp .env.example .env
```

Terminal 1 — the local Firebase emulator:

```bash
npm run emulators
```

Terminal 2 — load the demo data (once per emulator start):

```bash
npm run seed
```

Terminal 3 — the app:

```bash
npm start
```

Press `i` for the iOS simulator, `a` for Android, or `w` for the browser. The seed
script prints the three demo logins.

**Consent starts OFF on purpose.** Sign in as the athlete and the composer is locked.
Sign in as the parent, flip *Training consent* on the You tab, and the athlete's
composer unlocks — live, without either client restarting. That is the whole product in
thirty seconds.

### Proving the two platforms really do talk

Run the app twice against the same emulator — an iOS simulator and an Android emulator,
or two browser windows — and sign in as different people. Send a message in one. It
appears in the other. There is no sync layer to configure: both clients are the same
JavaScript holding an `onSnapshot` listener on one Firestore collection.

---

## Layout

```
app/                     expo-router file routes
  _layout.tsx            SessionProvider + themed Stack
  index.tsx              auth gate
  sign-in.tsx
  (tabs)/                Messages · Calendar · Locker · You
  thread/[id].tsx        conversation, with the monitoring banner
  workflow/[id].tsx      sandboxed WebView for a coach-published HTML doc
src/
  firebase.ts            app/auth/db init; emulator wiring
  data.ts                every Firestore read and write, each shaped to a rule
  session.tsx            who is signed in, which role, live consent
  theme.ts               design-system tokens ported from the site
  ui.tsx                 Banner, Avatar, Card, Setting, Button …
  workflowBridge.ts      the script injected into workflow WebViews
firebase/
  firestore.rules        the security model
  test/rules.test.mjs    32 assertions that pin it
scripts/
  seed.mjs               demo data for the emulator
  workflow-docs.mjs      the three training documents
  set-coach-uid.mjs      keeps EXPO_PUBLIC_COACH_UID and the rules constant in sync
.github/workflows/       CI, Android APK, iOS TestFlight
```

## Checks

```bash
npm run typecheck
```

```bash
npm run test:rules
```

The rules suite boots the Firestore emulator itself and asserts the things that would be
expensive to get wrong: that an athlete cannot post before consent, that a parent *can*
message the coach before consent (talking to him is how she decides), that the coach can
neither grant consent nor write the guardian out of a thread, that messages are
permanent, and that the exact queries `src/data.ts` runs are the ones the rules permit.
Both run in CI on every push.

---

## Shipping

`docs/SHIPPING.md` is the runbook. The short version: this repo is public, so
GitHub-hosted runners — including macOS — are free, and a pushed `v*` tag builds both
binaries with no Mac and no EAS subscription.

- **Android `.apk`** — an Ubuntu runner prebuilds and runs `assembleRelease`, then
  re-signs with your upload keystore. The APK is attached to the GitHub Release. If the
  keystore secrets are not set yet you still get a debug-signed APK you can sideload.
- **iOS TestFlight** — a macOS runner prebuilds, archives with Xcode cloud signing
  against an App Store Connect API key, and uploads with `fastlane pilot`.

Four Apple secrets (`APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`) and
four Android ones. `docs/SHIPPING.md` says exactly where each comes from and which steps
only the account holder can perform.

---

## Known limits, stated plainly

- **No push notifications.** Sending an FCM message needs server-side code, and Cloud
  Functions require Firebase's paid Blaze plan. The per-thread mute toggle is built and
  persists to the muter's own account, so the setting is already there when push is
  wired up. Until then it governs nothing.
- **Unread counts are approximate.** The Messages badge counts visible threads, not
  unread messages; real read receipts need a `lastRead` pointer and a rules change.
- **The Locker's read rule is open to any signed-in account.** Workflows are training
  content rather than personal data, but they are Blake's paid material. Closing it
  needs a membership record, which is a signup-flow decision nobody has made yet — so it
  is flagged here rather than guessed at.
- **Workflow HTML is capped at ~900 KB** by a security rule, below Firestore's 1 MiB
  document ceiling, so an oversized upload fails as a clear denial instead of an opaque
  write error.
- **Under-13 athletes should not have logins.** COPPA attaches below 13. The cheapest
  compliant path is a 13+ age rating and younger families using the parent account only.
  That is an owner decision, not a code change.
