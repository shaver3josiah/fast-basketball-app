/**
 * node --test scripts/check-appstore.mjs  (npm run test:appstore)
 *
 * Offline. Pins the guard that stops appstore-metadata.mjs rewriting a version record
 * DOWN to an untagged build's 1.0.0 -- which it would have done on 22 September 2026,
 * the first time an iOS build was dispatched by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semverLess, REVIEW_NOTES } from './appstore-metadata.mjs';

test('an untagged 1.0.0 build is below a 1.0.4 record', () => {
  assert.equal(semverLess('1.0.0', '1.0.4'), true);
});

test('a real bump, and the same version, both pass', () => {
  assert.equal(semverLess('1.0.5', '1.0.4'), false);
  assert.equal(semverLess('1.0.4', '1.0.4'), false);
});

test('parts compare as numbers, not strings', () => {
  assert.equal(semverLess('1.0.10', '1.0.9'), false);
  assert.equal(semverLess('1.1', '1.0.9'), false);
});

test('the review notes fit App Store Connect', () => {
  // Also enforced at import, but a test names the failure instead of crashing the suite.
  assert.ok(REVIEW_NOTES.length <= 4000, `${REVIEW_NOTES.length} characters`);
});
