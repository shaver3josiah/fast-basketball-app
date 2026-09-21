/**
 * Pushes the App Store listing into App Store Connect over its API.
 *
 * WHY THIS EXISTS RATHER THAN A DOCUMENT SOMEBODY TYPES FROM. docs/APP-STORE.md used
 * to be the copy AND the instructions for pasting it in by hand, which means the
 * listing and the file drift apart the first time anyone edits one of them, and
 * nothing notices. This file is the listing. The doc now describes the answers and
 * points here for the words.
 *
 * IT IS IDEMPOTENT. Every call is a PATCH of a resource App Store Connect creates
 * with the app, so running it twice changes nothing the second time. `--dry` prints
 * what it would send and touches nothing.
 *
 *   node scripts/appstore-metadata.mjs --dry
 *   node scripts/appstore-metadata.mjs
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *   - Screenshots. scripts/store-screenshots.mjs uploads those.
 *   - App Privacy (the nutrition label). Apple exposes it, but getting it wrong is a
 *     legal statement about a minor's data, so it is answered in the console against
 *     the table in docs/APP-STORE.md section 5 and read back by this script.
 *   - Submitting for review. That is `--submit`, and it is separate on purpose.
 *
 * CREDENTIALS come from the environment, never this file: the repository is public
 * and the App Review demo login reaches a real conversation with a minor in it.
 *
 *   ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_PATH (or ASC_KEY_P8 for the raw PEM)
 *   APP_REVIEW_DEMO_EMAIL, APP_REVIEW_DEMO_PASSWORD
 *   APP_REVIEW_CONTACT_FIRST/LAST/EMAIL/PHONE   (defaults below are all published)
 */
import { createSign, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

const BUNDLE_ID = 'com.fastbasketball.app';
const DRY = process.argv.includes('--dry');

// ---------------------------------------------------------------------------------
// The listing itself.
// ---------------------------------------------------------------------------------

/** Subtitle is 30 characters. Privacy policy must be reachable and specific. */
export const APP_INFO = {
  subtitle: 'Coach, parent, and player',
  privacyPolicyUrl: 'https://fast-basketball.com/privacy',
};

export const CATEGORIES = { primary: 'SPORTS', secondary: 'EDUCATION' };

export const LISTING = {
  description: `Fast Basketball is the private line between Coach Blake Kingsley, his players, and their parents.

Messages, session schedules, and training workflows in one place, for the families training with FAST Basketball in Fort Lauderdale. It is not a social network and there is nobody to meet: you see your coach, your athlete, and nothing else.

BUILT SO A PARENT NEVER HAS TO WONDER

A guardian reads every message between the coach and their athlete. Not a setting, not a toggle the coach can reach. It is written into the database rules, and the athlete is told about it in plain words on the screen. Nobody can edit or delete a message after it is sent, the coach included.

An athlete cannot message the coach at all until their guardian grants consent, and revoking it locks the conversation again immediately, without deleting anything that was already said.

WHAT YOU GET

- Direct messaging with your coach
- The training calendar for your athlete
- The Locker: workouts and evaluations the coach publishes, filled in on your phone
- A workout timer that logs the minutes your athlete actually trained
- Shot Form and the Dribble Counter, two training tools that run on the phone itself
- Streak reminders on your own phone, with a switch to turn them off

Accounts are created by Coach Kingsley for families training with FAST Basketball. Signing up needs an invitation to your email address.`,

  // Changeable without a new build, so it carries the one sentence that sells this.
  promotionalText: 'Every message between the coach and your athlete, visible to you, permanently.',

  // 100 characters, comma separated, NO spaces after the commas: a space is a
  // character, and Apple counts every one of them against the same 100.
  keywords: 'basketball,coach,training,youth sports,parent,player development,fort lauderdale,team',

  supportUrl: 'https://fast-basketball.com/contact',
  marketingUrl: 'https://fast-basketball.com',
};

/**
 * The age rating questionnaire. Booleans and enums are not interchangeable and the
 * API says which is which; the enums take NONE, INFREQUENT_OR_MILD or
 * FREQUENT_OR_INTENSE.
 *
 * THE TWO THAT DECIDE THE RATING:
 *   messagingAndChat    true  - private, invitation only, but it is still chat.
 *   userGeneratedContent true - the messages and the workflow answers. Private and
 *                               visible only to the coach and that family, but
 *                               "nobody else can see it" is not what the question asks.
 *
 * Answering either of those false to chase a lower rating is a false statement on a
 * form about an app used by minors, so both are true and the rating is whatever that
 * makes it. The review notes explain the safety model that goes with them.
 */
export const AGE_RATING = {
  alcoholTobaccoOrDrugUseOrReferences: 'NONE',
  gamblingSimulated: 'NONE',
  gunsOrOtherWeapons: 'NONE',
  horrorOrFearThemes: 'NONE',
  matureOrSuggestiveThemes: 'NONE',
  profanityOrCrudeHumor: 'NONE',
  sexualContentGraphicAndNudity: 'NONE',
  sexualContentOrNudity: 'NONE',
  violenceCartoonOrFantasy: 'NONE',
  violenceRealistic: 'NONE',
  violenceRealisticProlongedGraphicOrSadistic: 'NONE',

  // contests and medicalOrTreatmentInformation LOOK like yes/no questions and are
  // graded enums like the content ones. The API is the only place that says which is
  // which, and it says so only when you send the wrong type.
  contests: 'NONE',
  medicalOrTreatmentInformation: 'NONE',

  // Required, and the app has no ad SDK of any kind.
  advertising: false,
  gambling: false,
  lootBox: false,
  healthOrWellnessTopics: false,
  messagingAndChat: true,
  userGeneratedContent: true,
  socialMedia: false,
  // Only meaningful when socialMedia is true, and this is not social media.
  socialMediaAgeRestricted: false,
  // The only web view renders HTML the coach publishes and is sandboxed
  // (src/workflowBridge.ts). There is no address bar and no way to reach the web.
  unrestrictedWebAccess: false,
  // No age verification of any kind: the coach knows every family personally.
  ageAssurance: false,
  // Athletes under 13 are given no login; their family uses the parent's account.
  parentalControls: false,

  // APPLE COMPUTES 4+ FROM THE ANSWERS ABOVE AND THAT IS WRONG FOR THIS PRODUCT.
  // Under the age rating system Apple moved to in 2025, private chat and
  // user-generated content no longer raise the band by themselves; they are shown to
  // parents as capabilities instead. Left at the computed rating this app would be
  // offered to under-13s, and the whole COPPA position here is that an athlete under
  // 13 gets no login at all and trains from the parent's account. The override is
  // how a developer says the intended audience is older than the content implies.
  ageRatingOverrideV2: 'THIRTEEN_PLUS',
};

export const REVIEW_NOTES = `This app is a private messaging and scheduling tool for one basketball trainer and the families he coaches. It is invitation-only: the coach creates an athlete record naming a parent's email address, and an account can see nothing until a verified address matches one. The demo account above is already attached to an athlete record with an active conversation.

Sign in as the demo parent to see a conversation, the calendar, the Locker, and the consent controls on the You tab.

ON SAFETY, SINCE THE APP INVOLVES MINORS: a guardian is a permanent reader on every conversation between the coach and their athlete, enforced by Firestore Security Rules rather than by the UI. The coach cannot remove her, and cannot edit or delete a message. The athlete is shown a banner saying so. An athlete cannot send a message at all until the guardian grants consent, and the guardian can revoke it at any moment, which locks the conversation immediately. Athletes under 13 are given no login at all; those families use the parent's account, which is why the app is rated for 13 and over.

USER GENERATED CONTENT: the only content anyone can create is a message to their own coach and the answers they type into a training worksheet. There is no feed, no profile, no discovery and no way for one user to reach another, so there is nobody to block. The parent's consent switch is the block, and it is immediate.

CAMERA AND MICROPHONE: two optional training tools use them. Shot Form watches a shooting motion through the camera and the Dribble Counter listens for the bounce of a ball. Both run entirely on the device, record nothing, and send nothing anywhere. They are reached from the Locker tab and each asks before it opens the hardware.

REPORTING: the You tab links to a support form monitored by the account holder.

ACCOUNT DELETION is on the You tab under Account. It deletes the login and that account's own settings. Messages are retained deliberately, and the screen says so: they are the child-safety record the guardian is promised, and no party, the coach included, can delete one.`;

// ---------------------------------------------------------------------------------
// API client. ES256, raw (P1363) signature -- a DER one is rejected as malformed.
// ---------------------------------------------------------------------------------

const b64u = (b) => Buffer.from(b).toString('base64url');

function token() {
  const keyId = need('ASC_KEY_ID');
  const issuer = need('ASC_ISSUER_ID');
  const pem = process.env.ASC_KEY_P8
    ?? readFileSync(need('ASC_KEY_P8_PATH'), 'utf8');

  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: issuer, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }));
  const s = createSign('SHA256');
  s.update(`${head}.${body}`);
  return `${head}.${body}.${b64u(s.sign({ key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' }))}`;
}

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. See the header of scripts/appstore-metadata.mjs.`);
  return v;
}

async function asc(path, { method = 'GET', body } = {}) {
  const url = path.startsWith('http') ? path : `https://api.appstoreconnect.apple.com/v1/${path}`;
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}\n${JSON.stringify(json?.errors ?? json, null, 2)}`);
  return json;
}

/** PATCH unless --dry, in which case print the attributes and move on. */
async function patch(type, id, attributes, label) {
  if (DRY) { console.log(`  would patch ${label}: ${Object.keys(attributes).join(', ')}`); return; }
  await asc(`${type}/${id}`, { method: 'PATCH', body: { data: { type, id, attributes } } });
  console.log(`  ${label}`);
}

// ---------------------------------------------------------------------------------

export async function push() {
  const { data: [app] } = await asc(`apps?filter[bundleId]=${BUNDLE_ID}`);
  if (!app) throw new Error(`no app record for ${BUNDLE_ID}`);
  console.log(`app ${app.id} (${app.attributes.name})`);

  // Nothing in this app plays music, shows film or quotes a book. Left unanswered,
  // Apple holds the submission for it.
  await patch('apps', app.id, { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' }, 'content rights');

  // ---- the app-level record: name, subtitle, privacy policy, categories ----------
  const { data: [info] } = await asc(`apps/${app.id}/appInfos`);
  const { data: infoLocs } = await asc(`appInfos/${info.id}/appInfoLocalizations`);
  const enInfo = infoLocs.find((l) => l.attributes.locale === 'en-US');
  await patch('appInfoLocalizations', enInfo.id, APP_INFO, 'subtitle and privacy policy URL');

  if (DRY) {
    console.log(`  would set categories: ${CATEGORIES.primary} / ${CATEGORIES.secondary}`);
  } else {
    // Categories are relationships, not attributes, so they do not go through patch().
    await asc(`appInfos/${info.id}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'appInfos',
          id: info.id,
          relationships: {
            primaryCategory: { data: { type: 'appCategories', id: CATEGORIES.primary } },
            secondaryCategory: { data: { type: 'appCategories', id: CATEGORIES.secondary } },
          },
        },
      },
    });
    console.log(`  categories ${CATEGORIES.primary} / ${CATEGORIES.secondary}`);
  }

  // Read the declaration rather than assuming it shares the appInfo's id. It does
  // today, and a listing of appInfos does not carry the relationship at all, so
  // assuming it is a guess that happens to work.
  const rating = await asc(`appInfos/${info.id}/ageRatingDeclaration`);
  await patch('ageRatingDeclarations', rating.data.id, AGE_RATING, 'age rating questionnaire');

  // ---- the version being prepared ------------------------------------------------
  const { data: versions } = await asc(
    `apps/${app.id}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION&limit=1`,
  );
  const version = versions[0];
  if (!version) throw new Error('no version is in PREPARE_FOR_SUBMISSION; create one in App Store Connect');

  // The version string has to equal the build's CFBundleShortVersionString, and the
  // workflow stamps that from the git tag -- so the newest build decides it, not
  // app.json, whose expo.version has sat at 1.0.0 across every release on purpose.
  const build = await newestBuild(app.id);
  console.log(`version ${version.attributes.versionString} -> ${build.short} (build ${build.number})`);
  if (version.attributes.versionString !== build.short) {
    await patch('appStoreVersions', version.id, { versionString: build.short }, `version string ${build.short}`);
  }

  if (DRY) {
    console.log(`  would attach build ${build.number}`);
  } else {
    await asc(`appStoreVersions/${version.id}/relationships/build`, {
      method: 'PATCH',
      body: { data: { type: 'builds', id: build.id } },
    });
    console.log(`  attached build ${build.number}`);
  }

  const { data: verLocs } = await asc(`appStoreVersions/${version.id}/appStoreVersionLocalizations`);
  const enVer = verLocs.find((l) => l.attributes.locale === 'en-US');
  await patch('appStoreVersionLocalizations', enVer.id, LISTING, 'description, keywords and URLs');

  // ---- what App Review is told ---------------------------------------------------
  const review = {
    contactFirstName: process.env.APP_REVIEW_CONTACT_FIRST || 'Josiah',
    contactLastName: process.env.APP_REVIEW_CONTACT_LAST || 'Shaver',
    contactEmail: process.env.APP_REVIEW_CONTACT_EMAIL || 'shaver3josiah@gmail.com',
    contactPhone: process.env.APP_REVIEW_CONTACT_PHONE || '+1 503 686 8371',
    demoAccountRequired: true,
    demoAccountName: need('APP_REVIEW_DEMO_EMAIL'),
    demoAccountPassword: need('APP_REVIEW_DEMO_PASSWORD'),
    notes: REVIEW_NOTES,
  };

  const existing = await asc(`appStoreVersions/${version.id}/appStoreReviewDetail`).catch(() => null);
  if (existing?.data) {
    await patch('appStoreReviewDetails', existing.data.id, review, 'review notes and demo account');
  } else if (DRY) {
    console.log('  would create the review detail (demo account + notes)');
  } else {
    await asc('appStoreReviewDetails', {
      method: 'POST',
      body: {
        data: {
          type: 'appStoreReviewDetails',
          attributes: review,
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
        },
      },
    });
    console.log('  review notes and demo account');
  }

  await setFreePrice(app.id);

  return { appId: app.id, versionId: version.id, infoId: info.id, build };
}

/**
 * A price schedule with one free tier. Without any schedule the app has no price at
 * all and the submission is held for it, which reads in the console as the vague
 * "Pricing and Availability" warning rather than as a missing number.
 *
 * The price point id encodes the app, so it is looked up rather than hard-coded, and
 * the free one is the row whose customerPrice is zero.
 */
async function setFreePrice(appId) {
  const existing = await asc(`appPriceSchedules/${appId}/manualPrices?limit=1`).catch(() => null);
  if (existing?.data?.length) { console.log('  price already set'); return; }

  const { data: points } = await asc(`apps/${appId}/appPricePoints?filter[territory]=USA&limit=200`);
  const free = points.find((p) => Number(p.attributes.customerPrice) === 0);
  if (!free) throw new Error('no free price point offered for USA');

  if (DRY) { console.log('  would set the price to Free, base territory USA'); return; }

  await asc('appPriceSchedules', {
    method: 'POST',
    body: {
      data: {
        type: 'appPriceSchedules',
        relationships: {
          app: { data: { type: 'apps', id: appId } },
          baseTerritory: { data: { type: 'territories', id: 'USA' } },
          manualPrices: { data: [{ type: 'appPrices', id: '${new-price}' }] },
        },
      },
      included: [{
        type: 'appPrices',
        id: '${new-price}',
        relationships: {
          appPricePoint: { data: { type: 'appPricePoints', id: free.id } },
          territory: { data: { type: 'territories', id: 'USA' } },
        },
      }],
    },
  });
  console.log('  price: Free, base territory USA');
}

/** The most recently uploaded VALID build, with its marketing version. */
async function newestBuild(appId) {
  // The top-level /builds collection, not apps/{id}/builds: the relationship
  // endpoint accepts no filter, no sort and no include, so it can only hand back
  // whatever order it likes.
  const { data } = await asc(
    `builds?filter[app]=${appId}&filter[processingState]=VALID&sort=-uploadedDate&limit=1`,
  );
  const build = data[0];
  if (!build) throw new Error('no VALID build is uploaded yet');
  const pre = await asc(`builds/${build.id}/preReleaseVersion`);
  return { id: build.id, number: build.attributes.version, short: pre.data.attributes.version };
}

/** Everything the API cannot answer, read back so the gap is a list rather than a surprise. */
export async function remaining({ appId, versionId }) {
  const gaps = [];

  const { data: locs } = await asc(`appStoreVersions/${versionId}/appStoreVersionLocalizations`);
  const en = locs.find((l) => l.attributes.locale === 'en-US');
  const { data: sets } = await asc(`appStoreVersionLocalizations/${en.id}/appScreenshotSets`);
  if (!sets.length) gaps.push('screenshots: none uploaded (npm run screenshots -- --upload)');

  // App Privacy is NOT in the App Store Connect API -- every appDataUsage path
  // answers 404, and fastlane cannot reach it either. It is a console form, and it
  // is the one remaining thing this script cannot check OR fill, so it is always
  // reported rather than guessed at.
  gaps.push('App Privacy: answer the nutrition label in the console, from docs/APP-STORE.md section 5 (no API exists)');

  const price = await asc(`appPriceSchedules/${appId}/manualPrices?limit=1`).catch(() => null);
  if (!price?.data?.length) gaps.push('price: no price tier is set');

  return gaps;
}

if (process.argv[1]?.endsWith('appstore-metadata.mjs')) {
  const ids = await push();
  const gaps = await remaining(ids);
  console.log(gaps.length ? `\nstill needed before review:\n  - ${gaps.join('\n  - ')}` : '\nnothing else outstanding');
}
