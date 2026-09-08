/**
 * The three training documents Coach Kingsley publishes to the Locker.
 *
 * Ported from docs/app-preview.html. One deliberate change: the preview baked the
 * restore/collect bridge into every document. Here the documents are plain HTML with
 * `data-k` attributes and nothing else, and the bridge is injected by the app
 * (src/workflowBridge.ts). A coach writing his own HTML in any editor gets saving for
 * free — he never has to know the bridge exists.
 */

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const block = (title, items) =>
  `<section><h2>${esc(title)}</h2>` +
  items
    .map(
      (t, i) =>
        `<label class="chk"><input type="checkbox" data-k="${esc(title.slice(0, 6) + i)}"><span>${esc(t)}</span></label>`
    )
    .join('') +
  '</section>';

const field = (k, label, type) => {
  const input =
    type === 'textarea'
      ? `<textarea data-k="${k}" rows="3" placeholder="Type here…"></textarea>`
      : `<input type="number" data-k="${k}" min="1" max="10" placeholder="1–10">`;
  return `<section><h2>${esc(label)}</h2>${input}</section>`;
};

const textInput = (k, label, placeholder) =>
  `<section><h2>${esc(label)}</h2><input type="text" data-k="${k}" placeholder="${esc(placeholder)}"></section>`;

const dateInput = (k, label) =>
  `<section><h2>${esc(label)}</h2><input type="date" data-k="${k}"></section>`;

const numInput = (k, label, min, max, placeholder) =>
  `<section><h2>${esc(label)}</h2>` +
  `<input type="number" data-k="${k}" min="${min}" max="${max}" placeholder="${esc(placeholder)}"></section>`;

/** The one number Blake's whole promise turns on, so it gets its own box. */
const headline = (k, label, hint) =>
  `<div class="big"><h2>${esc(label)}</h2>` +
  `<input type="number" data-k="${k}" min="0" max="48" placeholder="0">` +
  `<p style="font-size:.8rem;color:#5a3438;margin-top:8px">${esc(hint)}</p></div>`;

/** Several 0-10 rows under one heading. */
const ratings = (title, items) =>
  `<section><h2>${esc(title)}</h2>` +
  items
    .map(
      ([k, labelText]) =>
        `<label class="rr"><span>${esc(labelText)}</span>` +
        `<input type="number" data-k="${k}" min="0" max="10" placeholder="0–10"></label>`
    )
    .join('') +
  '</section>';

const spotTable = () => {
  const spots = [
    'Left corner',
    'Left wing',
    'Top of key',
    'Right wing',
    'Right corner',
    'Elbows',
    'Free throw',
  ];
  return (
    '<section><h2>By spot</h2><table><tr><th>Spot</th><th>Makes</th><th>Attempts</th></tr>' +
    spots
      .map(
        (s, i) =>
          `<tr><td>${esc(s)}</td>` +
          `<td><input type="number" data-k="m${i}" min="0" placeholder="0"></td>` +
          `<td><input type="number" data-k="a${i}" min="0" placeholder="0"></td></tr>`
      )
      .join('') +
    '</table><p class="tot" id="tot">0 makes · 0 attempts</p></section>'
  );
};

const CSS = [
  '*{box-sizing:border-box;margin:0;padding:0}',
  'body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a20;background:#fff;padding:20px 18px 30px}',
  'h1{font-size:1.32rem;line-height:1.2;color:#0A0A0C;margin-bottom:4px;letter-spacing:-.01em}',
  '.by{font-size:.74rem;text-transform:uppercase;letter-spacing:.14em;color:#E60C20;font-weight:700;margin-bottom:14px}',
  '.note{background:#FDF1F2;border-left:3px solid #E60C20;padding:10px 12px;font-size:.85rem;color:#5a3438;border-radius:0 6px 6px 0;margin-bottom:20px}',
  'section{margin-bottom:22px}',
  'h2{font-size:.72rem;text-transform:uppercase;letter-spacing:.13em;color:#6C6C78;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #E7E3DC}',
  '.chk{display:flex;gap:10px;align-items:flex-start;padding:9px 0;cursor:pointer;font-size:.9rem}',
  '.chk input{width:19px;height:19px;flex:none;margin-top:1px;accent-color:#E60C20;cursor:pointer}',
  '.chk input:checked+span{color:#8a8a95;text-decoration:line-through}',
  'textarea,input[type=number],input[type=text],input[type=date]{width:100%;font:inherit;font-size:.88rem;padding:9px 11px;border:1px solid #d8d4cd;border-radius:7px;background:#FAFAF8;color:#1a1a20}',
  'textarea:focus,input:focus{outline:2px solid #E60C20;outline-offset:1px;border-color:#E60C20}',
  'table{width:100%;border-collapse:collapse}',
  'th{text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:#6C6C78;padding:0 0 7px}',
  'th:not(:first-child){width:74px}',
  'td{padding:4px 0;font-size:.86rem;border-top:1px solid #F0EDE8}',
  'td:not(:first-child){padding-left:8px}',
  'td input{padding:7px 9px;text-align:center}',
  '.rr{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #F0EDE8}',
  '.rr span{flex:1;font-size:.88rem}',
  '.rr input{width:78px;flex:none;text-align:center;padding:7px 9px}',
  '.big{background:#FDF1F2;border:1px solid #E60C20;border-radius:8px;padding:12px;margin-bottom:20px}',
  '.big h2{border:0;padding:0;margin-bottom:8px;color:#E60C20}',
  '.big input{font-size:1.3rem;font-weight:700;text-align:center;width:110px}',
  '.tot{margin-top:12px;font-size:.85rem;font-weight:700;color:#E60C20}',
  '.foot{margin-top:26px;padding-top:14px;border-top:1px solid #E7E3DC;font-size:.72rem;color:#9C9CA9;text-align:center}',
].join('');

/** Running totals for the shooting log. Content-specific, so it lives in the document. */
const TOTALS_JS = [
  'function fbTotals(){',
  '  var t=document.getElementById("tot"); if(!t) return;',
  '  var m=0,a=0;',
  '  document.querySelectorAll("[data-k]").forEach(function(el){',
  '    if(/^m\\d/.test(el.dataset.k)) m+=(+el.value||0);',
  '    if(/^a\\d/.test(el.dataset.k)) a+=(+el.value||0);',
  '  });',
  '  var pct=a?" \\u00B7 "+Math.round(m/a*100)+"%":"";',
  '  t.textContent=m+" makes \\u00B7 "+a+" attempts"+pct;',
  '}',
  'fbTotals();',
  'document.addEventListener("input",fbTotals);',
  'document.addEventListener("change",fbTotals);',
].join('\n');

const BODIES = {
  w1: {
    name: '4-Week Guard Development',
    body:
      '<h1>4-Week Guard Development</h1><p class="by">Fast Basketball · Blake Kingsley</p>' +
      '<p class="note">Check a block when the work is done. Not when you started it.</p>' +
      block('Week 1 — Tight-space handling', [
        'Two-ball pound, 3×30s',
        'Cone weave, left hand only, 6 passes',
        'Live-dribble finishes, 20 makes',
      ]) +
      block('Week 2 — Change of pace', [
        'Hesitation into pull-up, 25 makes',
        'Snatch-back series, 4×10',
        'Full-court change of speed, 8 lengths',
      ]) +
      block('Week 3 — Finishing package', [
        'Inside hand, both sides, 30 makes',
        'Floater from the nail, 25 makes',
        'Contact finishes with pad, 20 makes',
      ]) +
      block('Week 4 — Put it live', [
        '1v1 from the wing, 10 possessions',
        '2v2 read the help, 10 possessions',
        'Film review with Coach',
      ]) +
      field('notes', 'What felt hardest this month?', 'textarea'),
    script: '',
  },
  w2: {
    name: 'Pre-Practice Warmup Protocol',
    body:
      '<h1>Pre-Practice Warmup</h1><p class="by">Fast Basketball · Blake Kingsley</p>' +
      '<p class="note">Ten minutes. Every session. No exceptions, no shortcuts.</p>' +
      block('Movement prep', [
        'Leg swings, 10 each direction',
        'Hip 90/90, 8 each side',
        'Ankle rocks, 15 each',
      ]) +
      block('Activation', ['Lateral band walk, 2×12', 'Pogo hops, 3×10', 'Wall drive, 8 each leg']) +
      block('Ball prep', [
        'Stationary pound, 60s',
        'Figure-8, 45s',
        'Form shooting from 5 spots, 5 makes each',
      ]) +
      field('rpe', 'How did the body feel today? (1 dead — 10 fresh)', 'number'),
    script: '',
  },
  w4: {
    name: 'Weekly Game Evaluation',
    cadence: 'weekly',
    body:
      '<h1>Weekly Game Evaluation</h1><p class="by">Fast Basketball · Blake Kingsley</p>' +
      '<p class="note">Fill this in after the game, not on Sunday night from memory. ' +
      'Honest numbers or it is worth nothing to either of us.</p>' +
      headline(
        'minutes',
        'Minutes played',
        'This is the number we are moving. Bench to rotation is 8 minutes becoming 15.'
      ) +
      textInput('opponent', 'Who did you play?', 'Opponent') +
      dateInput('gamedate', 'What day was the game?') +
      ratings('The box score', [
        ['pts', 'Points'],
        ['reb', 'Rebounds'],
        ['ast', 'Assists'],
        ['tov', 'Turnovers'],
      ]) +
      ratings('Rate yourself, 0 to 10', [
        ['r_effort', 'Effort — did you empty the tank?'],
        ['r_decisions', 'Decisions — right read, right time?'],
        ['r_defense', 'Defence — on the ball and off it'],
        ['r_composure', 'Composure after a mistake'],
      ]) +
      field('coachsaid', 'What did your team coach tell you?', 'textarea') +
      field('onething', 'One thing you would do differently', 'textarea'),
    script: '',
  },
  w5: {
    name: 'Quarterly Progress Report',
    cadence: 'quarterly',
    body:
      '<h1>Quarterly Progress Report</h1><p class="by">Fast Basketball · Blake Kingsley</p>' +
      '<p class="note">Three months of work, looked at straight. Write what happened, ' +
      'not what you meant to happen.</p>' +
      ratings('Minutes per game', [
        ['min_start', 'Where you started this quarter'],
        ['min_now', 'Where you are now'],
      ]) +
      field('goalset', 'What did we set out to fix this quarter?', 'textarea') +
      field('goalmet', 'Did you fix it? Say how you know.', 'textarea') +
      field('improved', 'What got better that you can point to', 'textarea') +
      field('stuck', 'What is still stuck', 'textarea') +
      block('The standards, honestly', [
        'I was on time, 15 minutes early, every session',
        'I brought my journal and filled it in',
        'I did the work between sessions, not just at sessions',
        'I was coachable when the correction was hard to hear',
      ]) +
      field('nextgoal', 'What are we fixing next quarter?', 'textarea'),
    script: '',
  },
  w6: {
    name: 'Session Journal',
    cadence: 'daily',
    body:
      '<h1>Session Journal</h1><p class="by">Fast Basketball · Blake Kingsley</p>' +
      '<p class="note">Two minutes, before you leave the court. While it is still fresh.</p>' +
      textInput('worked', 'What did we work on?', 'Ball handling, finishing…') +
      field('clicked', 'What clicked?', 'textarea') +
      field('didnt', 'What did not?', 'textarea') +
      numInput('effort', 'Your effort today, 1 to 10', 1, 10, '1–10'),
    script: '',
  },
  w3: {
    name: 'Shooting Log — 200 Makes',
    body:
      '<h1>Shooting Log — 200 Makes</h1><p class="by">Fast Basketball · Blake Kingsley</p>' +
      '<p class="note">Makes only. Log the attempts honestly — the ratio is the point.</p>' +
      spotTable() +
      field('notes', 'Where did the misses cluster?', 'textarea'),
    script: TOTALS_JS,
  },
};

export function workflowDocs() {
  return Object.entries(BODIES).map(([id, { name, body, script, cadence }]) => {
    const html =
      '<!doctype html><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      `<title>${esc(name)}</title>` +
      `<style>${CSS}</style><body>${body}` +
      '<p class="foot">Uploaded by Coach Kingsley · rendered inside Fast Basketball</p>' +
      (script ? '<script>' + script + '</scr' + 'ipt>' : '') +
      '</body>';
    // Absent cadence means 'once' — the three original documents keep one saved copy.
    return { id, name, html, cadence: cadence ?? 'once', sizeBytes: Buffer.byteLength(html, 'utf8') };
  });
}

// Run directly (`node scripts/workflow-docs.mjs`) to print a size report.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('workflow-docs.mjs')) {
  for (const d of workflowDocs())
    console.log(`${d.id}  ${d.name.padEnd(30)} ${d.cadence.padEnd(10)} ${d.sizeBytes} bytes`);
}
