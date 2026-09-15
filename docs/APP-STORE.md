# The App Store submission

`SHIPPING.md` §2 gets a build into TestFlight. This is the other half: the words, the
answers and the settings App Store Connect asks for before a build can go to review,
written out so submitting is typing rather than deciding.

The build pipeline is done. What follows needs your Apple account and nobody else's.

> **Demo credentials are not in this file.** This repository is public. They are in
> `docs/owner-open-items.md` at the project root, which is not version controlled.

---

## 1. The app record

| Field | Value |
|---|---|
| Name | `Fast Basketball` |
| Subtitle | `Coach, parent, and player` |
| Bundle ID | `com.fastbasketball.app` — must match `app.json` exactly |
| SKU | `fast-basketball-app` |
| Primary category | Sports |
| Secondary category | Education |
| Primary language | English (U.S.) |
| Price | Free |
| Availability | United States is enough; the roster is one gym in Fort Lauderdale |

**Do not opt into the Kids Category.** It brings a stricter rule set — no external links,
no third-party analytics, a parental gate on everything — and this app is built for the
13-and-over shape described in §4 instead.

## 2. Description

> Fast Basketball is the private line between Coach Blake Kingsley, his players, and
> their parents.
>
> Messages, session schedules, and training workflows in one place, for the families
> training with FAST Basketball in Fort Lauderdale. It is not a social network and there
> is nobody to meet: you see your coach, your athlete, and nothing else.
>
> **Built so a parent never has to wonder.**
>
> A guardian reads every message between the coach and their athlete. Not a setting, not
> a toggle the coach can reach — it is written into the database rules, and the athlete is
> told about it in plain words on the screen. Nobody can edit or delete a message after it
> is sent, the coach included.
>
> An athlete cannot message the coach at all until their guardian grants consent, and
> revoking it locks the conversation again immediately, without deleting anything that was
> already said.
>
> **What you get**
>
> - Direct messaging with your coach
> - The training calendar for your athlete
> - The Locker: workouts and evaluations the coach publishes, filled in on your phone
> - Per-conversation notification settings, controlled by the guardian
>
> Accounts are created by Coach Kingsley for families training with FAST Basketball.
> Signing up needs an invitation to your email address.

**Promotional text** (changeable without a new build):

> Every message between the coach and your athlete, visible to you, permanently.

**Keywords** (100 characters, comma-separated, no spaces):

```
basketball,coach,training,youth sports,parent,player development,fort lauderdale,team
```

- **Support URL**: `https://fast-basketball.com/contact`
- **Marketing URL**: `https://fast-basketball.com`
- **Privacy Policy URL**: `https://fast-basketball.com/privacy`

The privacy policy and the support link also open from inside the app, on the You tab.
App Review looks for them there and not only on the listing.

## 3. Screenshots

Required: 6.9-inch iPhone, 1320 × 2868. One set covers every iPhone size. `app.json` sets
`supportsTablet: false`, so **no iPad screenshots are needed**.

Take them from a TestFlight build signed in as the demo parent, so the content is real.
Five, in this order, are the story:

1. A conversation with the monitoring banner visible
2. The You tab showing Training consent granted
3. The Calendar
4. The Locker
5. An athlete's thread while consent is off — the locked composer

## 4. Age rating

Answer the questionnaire honestly. Two answers decide the outcome here:

- **Chat or messaging between users**: yes. Private and invitation-only, not open.
- **Unrestricted web access**: no. The only web view renders HTML the coach publishes, and
  it is sandboxed (`src/workflowBridge.ts`).

Expect **13+**. That is also the rating this product wants: COPPA attaches below 13, and
the cheap compliant path is no logins for athletes under 13 — those families share the
parent's account, which the signup screen and the roster screen both say. Leaving the
athlete's email blank when inviting is what enforces it.

## 5. App Privacy

Everything below is **linked to the user's identity**, used for **App Functionality**, and
**not** used for tracking. There is no advertising SDK, no analytics SDK and no data broker
in this app — Firebase Auth and Firestore are the whole backend.

| Data type | Collected | Why |
|---|---|---|
| Email address | Yes | It is the login, and the invitation is addressed to it |
| Name | Yes | The coach records the athlete's and the guardian's names |
| Other user content | Yes | The messages, and the workflow answers an athlete fills in |
| User ID | Yes | The Firebase Auth uid every record is keyed on |

Answer **No** to tracking, advertising data, location, contacts, photos, health, financial
info, browsing history and diagnostics. Nothing in the app collects them.

One question needs care: Apple asks whether each type is used for "App Functionality" or
for "Analytics". It is functionality only.

Account deletion is offered in the app — You tab, Delete my account — which is what
Guideline 5.1.1(v) requires.

## 6. App Review Information

Paste the demo credentials from `docs/owner-open-items.md`, and these notes:

> This app is a private messaging and scheduling tool for one basketball trainer and the
> families he coaches. It is invitation-only: the coach creates an athlete record naming a
> parent's email address, and an account can see nothing until a verified address matches
> one. The demo account above is already attached to an athlete record with an active
> conversation.
>
> **Sign in as the demo parent** to see a conversation, the calendar, the Locker, and the
> consent controls on the You tab.
>
> **On safety, since the app involves minors:** a guardian is a permanent reader on every
> conversation between the coach and their athlete, enforced by Firestore Security Rules
> rather than by the UI — the coach cannot remove her, and cannot edit or delete a message.
> The athlete is shown a banner saying so. An athlete cannot send a message at all until
> the guardian grants consent, and the guardian can revoke it at any moment, which locks
> the conversation immediately. Athletes under 13 are given no login at all; those families
> use the parent's account, which is why the app is rated 13+.
>
> **Reporting:** the You tab links to a support form monitored by the account holder. There
> is no public feed, no discovery and no way for one user to contact another, so there is
> nobody to block — the only person a family can message is their own coach, and the
> parent's consent switch is the block.
>
> **Account deletion** is on the You tab under Account. It deletes the login and that
> account's own settings. Messages are retained deliberately, and the screen says so: they
> are the child-safety record the guardian is promised, and no party, the coach included,
> can delete one.

## 7. Two things commonly panicked about that do not apply

- **Sign in with Apple** (Guideline 4.8) is required only when an app offers a *third-party*
  login — Google, Facebook and the like. This app has email and password through Firebase
  Auth and nothing else, so Sign in with Apple is not required.
- **A web page for account deletion** is not needed. Apple wants deletion to start in the
  app, and it does.

## 8. After the first upload

Apple emails within about an hour of a successful upload. Two messages are common and
neither blocks TestFlight:

- **"Missing Purpose String"** would name an API used without a usage description. The app
  touches no camera, microphone, location or photo library, so it should not appear. If it
  does, it names the key to add under `ios.infoPlist` in `app.json`.
- **A privacy manifest notice.** Expo's prebuild writes `PrivacyInfo.xcprivacy` and every
  native dependency here ships its own. If Apple names a missing declaration, add it under
  `ios.privacyManifests` in `app.json` and re-tag. It is metadata, not code.

A build stays installable from TestFlight for 90 days. The monthly keep-alive in
`.github/workflows/ios-testflight.yml` re-uploads the same code so a parent's app does not
quietly stop opening — see `SHIPPING.md` §5b.
