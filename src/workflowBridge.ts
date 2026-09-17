/**
 * The bridge injected into every Locker WebView.
 *
 * The coach's HTML knows nothing about this. It only has to mark its inputs with
 * `data-k="someKey"`; restore-on-open and save-on-tap are supplied here. That keeps
 * the authoring surface to plain HTML — the day Blake writes a document by hand in a
 * text editor, it saves like the others with no extra work.
 *
 * Runs inside the WebView, so this is a string, not a module. Anything referenced
 * must exist in the page, not in the bundle.
 */

/** Messages the page posts back to React Native. */
export type BridgeMessage =
  | { type: 'wfstate'; answers: Record<string, string | boolean | number> }
  | { type: 'wfheight'; height: number };

const RESTORE_AND_LISTEN = `
(function () {
  if (window.__fbBridge) return;          // injectedJavaScript re-runs on some navigations
  window.__fbBridge = true;

  var STATE = __STATE__;

  function nodes() { return document.querySelectorAll('[data-k]'); }

  function restore() {
    nodes().forEach(function (el) {
      var v = STATE[el.dataset.k];
      if (v === undefined) return;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
    // Let the document's own listeners (running totals, etc.) see the restored values.
    document.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function collect() {
    var out = {};
    nodes().forEach(function (el) {
      var v = el.type === 'checkbox' ? el.checked : el.value;
      // Empty strings and unchecked boxes are absence, not data. Dropping them keeps
      // the document under the 200-key ceiling the security rule enforces.
      if (v !== '' && v !== false) out[el.dataset.k] = v;
    });
    return out;
  }

  function send(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  // React Native asks by injecting \`window.__fbCollect()\`; the page answers over onMessage.
  window.__fbCollect = function () { send({ type: 'wfstate', answers: collect() }); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restore);
  } else {
    restore();
  }

  true;   // iOS: a non-null final value or injectedJavaScript logs a warning
})();
`;

/** Build the injected script, pre-seeded with whatever the athlete saved last time. */
export function bridgeScript(saved: Record<string, unknown> | undefined): string {
  // JSON.stringify output is already valid JS source, so it is spliced in as-is —
  // re-escaping the backslashes would corrupt any answer that contains one. Only the
  // two sequences JSON permits but a script context does not are rewritten.
  const json = JSON.stringify(saved ?? {})
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return RESTORE_AND_LISTEN.replace('__STATE__', json);
}

/** Injected on demand when the athlete taps Save. */
export const COLLECT_SCRIPT = 'window.__fbCollect && window.__fbCollect(); true;';

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v)) || 0;

/**
 * The night-shots worksheet, read back as a shooting line.
 *
 * Detected by KEY SHAPE rather than by workflow id, so it also works for a submission
 * saved before the id was denormalised onto the document, and so a copy of the worksheet
 * published under another id still summarizes properly.
 *
 * Every value the page saves is a STRING (its set() writes String(v)), which is why the
 * generic summary below was useless here: nothing is ever `true`, and counting keys just
 * reported how many boxes exist.
 */
function nightShots(a: Record<string, unknown>): string | null {
  if (a.ns_m0 === undefined && a.ns_a0 === undefined) return null;
  let makes = 0;
  let shots = 0;
  for (let i = 0; i < 7; i++) {
    makes += num(a[`ns_m${i}`]);
    shots += num(a[`ns_a${i}`]);
  }
  const pct = shots ? Math.round((makes / shots) * 100) : 0;
  const best = num(a.ns_best);
  const mins = num(a.ns_min);
  return (
    `${makes} of 70 makes · ${pct}% on ${shots} shots` +
    (best ? ` · best run ${best}` : '') +
    (mins ? ` · ${mins} min` : '')
  );
}

/**
 * The dribble counter, read back as a session line.
 *
 * Detected by key shape for the same reason as the shooting log above, and it keeps its
 * own thousands separator rather than calling toLocaleString: a four-figure dribble count
 * is the normal case, and Intl is the one part of the runtime that differs between a
 * Hermes build, a JSC build and the web.
 */
function dribbles(a: Record<string, unknown>): string | null {
  if (a.dc_total === undefined) return null;
  const total = num(a.dc_total);
  const mins = num(a.dc_min);
  const pace = num(a.dc_pace);
  const best = num(a.dc_best);
  const workouts = String(a.dc_done ?? '').split(',').filter(Boolean).length;
  const grouped = String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (
    `${grouped} dribble${total === 1 ? '' : 's'}` +
    (mins ? ` \u00b7 ${mins} min` : '') +
    (pace ? ` \u00b7 ${pace}% on pace` : '') +
    (best ? ` \u00b7 best streak ${best}` : '') +
    (workouts ? ` \u00b7 ${workouts} workout${workouts === 1 ? '' : 's'}` : '')
  );
}

/**
 * A one-line summary for the Locker list, matching the preview's saved-pill copy.
 *
 * This is what the COACH reads down his roster, so a worksheet whose shape is known gets
 * a real line. Anything else falls back to the generic count, which is honest about
 * knowing nothing rather than inventing a number.
 */
export function summarize(answers: Record<string, unknown>): string {
  const known = nightShots(answers) ?? dribbles(answers);
  if (known) return known;
  const done = Object.values(answers).filter((v) => v === true).length;
  const filled = Object.keys(answers).length;
  if (done) return `${done} of the blocks done`;
  return `${filled} field${filled === 1 ? '' : 's'} filled`;
}

/** Self-check. `npm run test:bridge`. */
export function demo(): string {
  const eq = (got: unknown, want: unknown, what: string) => {
    if (String(got) !== String(want)) throw new Error(`${what}: got ${got}, wanted ${want}`);
  };

  // The shape the worksheet actually saves: strings, including zeros.
  const rack: Record<string, unknown> = { ns_best: '6', ns_min: '25', ns_notes: 'short left' };
  for (let i = 0; i < 7; i++) {
    rack[`ns_m${i}`] = String(i < 4 ? 10 : 0);
    rack[`ns_a${i}`] = String(i < 4 ? 14 : 0);
  }
  eq(summarize(rack), '40 of 70 makes · 71% on 56 shots · best run 6 · 25 min', 'a part-done rack');

  // THE REGRESSION THIS EXISTS FOR: before the known-shape branch, the line above came
  // out as "17 fields filled", which told the coach nothing at all.
  if (summarize(rack).includes('fields filled')) throw new Error('night-shots fell through to the generic summary');

  // A rack with no attempts must not divide by zero.
  const empty: Record<string, unknown> = { ns_m0: '0', ns_a0: '0' };
  eq(summarize(empty), '0 of 70 makes · 0% on 0 shots', 'an untouched rack');

  // The dribble counter saves strings too, and zero is a real answer: a session that
  // logged no workouts must not print "0 workouts".
  eq(
    summarize({ dc_total: '1240', dc_min: '18', dc_pace: '76', dc_best: '43', dc_done: 'warm,ladder' }),
    '1,240 dribbles \u00b7 18 min \u00b7 76% on pace \u00b7 best streak 43 \u00b7 2 workouts',
    'a full handles session'
  );
  eq(summarize({ dc_total: '80', dc_min: '0', dc_pace: '0', dc_best: '0', dc_done: '' }),
    '80 dribbles', 'a session that only counted');
  if (summarize({ dc_total: '80' }).includes('fields filled')) {
    throw new Error('the dribble counter fell through to the generic summary');
  }

  // Checkbox worksheets keep the old behaviour exactly.
  eq(summarize({ Week10: true, Week11: true, notes: 'x' }), '2 of the blocks done', 'checkboxes');
  eq(summarize({ opponent: 'Dillard', pts: '12' }), '2 fields filled', 'a typed form');
  eq(summarize({}), '0 fields filled', 'nothing saved');

  return 'workflowBridge.ts: all checks passed';
}
