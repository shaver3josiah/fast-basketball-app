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

/** A one-line summary for the Locker list, matching the preview's saved-pill copy. */
export function summarize(answers: Record<string, unknown>): string {
  const done = Object.values(answers).filter((v) => v === true).length;
  const filled = Object.keys(answers).length;
  if (done) return `${done} of the blocks done`;
  return `${filled} field${filled === 1 ? '' : 's'} filled`;
}
