#!/usr/bin/env node
// Generates the string table from docs/COPY.md: preset labels (2.8), level names (3), the UI
// copy deck (4), notifications and the Live Activity (5), widget strings (6) and invite
// messages (7). Also extracts the banned list (1.3) for the de-slop test.
//
//   node scripts/gen-strings.mjs           write packages/shared/src/strings/table.generated.ts
//                                           and packages/shared/generated/strings.json
//   node scripts/gen-strings.mjs --check   exit 1 if either file is out of date (CI drift check)
//
// Rules for reading COPY.md rows (documented in docs/build-notes/shared.md):
// - A table row whose first column holds a backticked key defines that key. Text comes from the
//   "Text" or "Label" column, the limit from "Max".
// - `a.b.c` / `.d` with text "X / Y" defines a.b.c = X and a.b.d = Y. The suffix replaces the
//   last key segment, or the one before a trailing `.a11y` (`cam.flash.on.a11y` / `.off`).
// - `order.label.size` … `order.label.extras` expands to one key per listed field label.
// - A single key whose text is "Prefix a / b / c" defines key.a, key.b, key.c.
// - Prose of the form `key` = "text" (max N) defines a key too (`onb.progress`).
// - Rows whose text only points elsewhere ("(from section 3)", "uses `snapv.react.a11y`") are
//   recorded as references, not strings.
// - Notification rows (5.1) define key.title, key.body and shared n.action.* keys.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  REPO_ROOT,
  backticked,
  extractPlaceholders,
  parseTables,
  prettierFormat,
  readCopy,
  section,
  sectionsUnder,
  slug,
  splitSections,
  writeOrCheck,
} from '../packages/shared/tools/copy-md.mjs';

const OUT_TS = join(REPO_ROOT, 'packages/shared/src/strings/table.generated.ts');
const OUT_JSON = join(REPO_ROOT, 'packages/shared/generated/strings.json');

const KEY_RE = /^[A-Za-z][A-Za-z0-9_.]*$/;
const CONTEXT_HEADERS = [
  'element',
  'where',
  'situation',
  'limit',
  'state',
  'surface',
  'channel',
  'control',
  'when',
];
// Parenthetical notes that are instructions to engineers, not part of the string.
const EDITORIAL_NOTES = [' (each from the small strings)'];

function fail(msg) {
  throw new Error(`gen-strings: ${msg}`);
}

class Table {
  constructor() {
    this.entries = new Map();
    this.references = [];
  }

  add(key, text, meta) {
    if (!KEY_RE.test(key)) fail(`bad key "${key}" (COPY.md line ${meta.line})`);
    if (!text) fail(`empty text for ${key} (COPY.md line ${meta.line})`);
    if (text.includes('`')) fail(`text of ${key} still holds a backtick: ${text}`);
    const prev = this.entries.get(key);
    if (prev) {
      if (prev.text !== text) {
        fail(
          `${key} is defined twice with different text: line ${prev.line} "${prev.text}", ` +
            `line ${meta.line} "${text}"`,
        );
      }
      prev.alsoAt.push(meta.line);
      return;
    }
    this.entries.set(key, {
      key,
      text,
      section: meta.section,
      context: meta.context ?? null,
      max: meta.max ?? null,
      line: meta.line,
      alsoAt: [],
    });
  }
}

function parseMax(cell) {
  if (cell == null) return null;
  const m = /^(\d+)(?: each)?$/.exec(cell.trim());
  return m ? Number(m[1]) : null;
}

function headerIndex(headers, pred) {
  return headers.findIndex((h) => pred(h.toLowerCase()));
}

/** Expands the key cell of one row into [{ key, text }]. */
function expandRow(keyCell, text, line, optionLabelToKey) {
  const keys = backticked(keyCell);
  if (keys.length === 0) return [];
  // Range: `order.label.size` … `order.label.extras`
  if (keys.length === 2 && keyCell.includes('…')) {
    const base = keys[0].slice(0, keys[0].lastIndexOf('.'));
    const labels = text.split(',').map((s) => s.trim());
    const out = labels.map((label) => {
      const k = optionLabelToKey.get(label);
      if (!k) fail(`line ${line}: field label "${label}" is not in COPY.md 2.7`);
      return { key: `${base}.${k}`, text: label };
    });
    for (const k of keys) {
      if (!out.some((o) => o.key === k)) fail(`line ${line}: range end ${k} is not in its list`);
    }
    return out;
  }
  // Siblings: `a.b.c` / `.d` / `.e`
  if (keys.length > 1) {
    const parts = text.split(' / ').map((s) => s.trim());
    if (parts.length !== keys.length) {
      fail(`line ${line}: ${keys.length} keys but ${parts.length} " / " texts`);
    }
    const base = keys[0].split('.');
    const slot = base[base.length - 1] === 'a11y' ? base.length - 2 : base.length - 1;
    return keys.map((k, i) => {
      if (i === 0) return { key: k, text: parts[0] };
      if (!k.startsWith('.')) return { key: k, text: parts[i] };
      const segs = [...base];
      segs[slot] = k.slice(1);
      return { key: segs.join('.'), text: parts[i] };
    });
  }
  const [key] = keys;
  // One key, alternatives in the text: "React with coffee / matcha / tea"
  if (text.includes(' / ') && !text.includes('{')) {
    const parts = text.split(' / ').map((s) => s.trim());
    const first = parts[0];
    const cut = first.lastIndexOf(' ');
    const prefix = first.slice(0, cut + 1);
    const variants = [first.slice(cut + 1), ...parts.slice(1)];
    return variants.map((v) => ({ key: `${key}.${slug(v)}`, text: `${prefix}${v}` }));
  }
  return [{ key, text }];
}

/** A text cell that points elsewhere instead of holding a string. */
function referenceOf(text) {
  const t = text.trim();
  if (/^\(.*\)$/.test(t)) return t;
  if (/^uses `[^`]+`$/.test(t)) return t;
  if (/^the visible /.test(t)) return t;
  if (/^the `report\.r\.1` to/.test(t)) return t;
  return null;
}

function cleanText(text) {
  let t = text.trim();
  for (const note of EDITORIAL_NOTES) t = t.replace(note, '');
  return t;
}

function optionLabelMap(sections) {
  // Field labels from 2.7 option tables, label -> details key. Smoothie & Juice "Add-ins" is
  // stored under `extras`, so its order label gets its own key, `addins`.
  const map = new Map();
  for (const t of parseTables(section(sections, '2.7').lines)) {
    const kc = headerIndex(t.headers, (h) => h === 'key');
    const lc = headerIndex(t.headers, (h) => h === 'label');
    if (kc === -1 || lc === -1) continue;
    for (const r of t.rows) {
      const [key] = backticked(r.cells[kc]);
      const label = r.cells[lc].replace(/\s*\(any\)\s*/, '').trim();
      if (label === 'Add-ins') map.set(label, 'addins');
      else if (!map.has(label)) map.set(label, key);
    }
  }
  return map;
}

function parseModerationReasons(sections, table, row, sec) {
  // `mod.reason.*`: the report.r.1 to .5 labels, lower case, plus the quoted extra phrase.
  const text = section(sections, '4.19')
    .lines.map((l) => l.text)
    .join('\n');
  const m = /Reason ids map to the database values[^:]*: (.+)$/m.exec(text);
  if (!m) fail('4.19 no longer maps report reasons to database values');
  const ids = [...m[1].matchAll(/`(?:report\.r)?\.(\d)` ([a-z_]+)/g)].map((x) => [x[1], x[2]]);
  if (ids.length !== 5) fail(`expected 5 report reason ids, found ${ids.length}`);
  const lower = (s) => (/^I\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  for (const [n, id] of ids) {
    const label = table.entries.get(`report.r.${n}`);
    if (!label) fail(`mod.reason.*: report.r.${n} is not defined before 4.19 moderation`);
    table.add(`mod.reason.${id}`, lower(label.text), {
      section: sec.number,
      context: '{reason} value',
      max: parseMax(row.cells[row.cells.length - 1]),
      line: row.lineNo,
    });
  }
  const extra = /"([^"]+)"/.exec(row.cells[2]);
  if (!extra) fail('mod.reason.* row lost its quoted extra reason');
  // Database value for a blocked word is 'text' (ARCHITECTURE.md 4.2 moderation_notices.reason).
  table.add('mod.reason.text', extra[1], {
    section: sec.number,
    context: '{reason} value',
    max: parseMax(row.cells[row.cells.length - 1]),
    line: row.lineNo,
  });
}

function parseGenericTables(sections, sec, table, labelMap) {
  for (const t of parseTables(sec.lines)) {
    const h = t.headers;
    const kc = headerIndex(h, (x) => x === 'key');
    if (kc === -1) continue;
    const isNotification =
      headerIndex(h, (x) => x === 'title') !== -1 && headerIndex(h, (x) => x === 'body') !== -1;
    if (isNotification) continue; // handled by parseNotifications
    const tc = headerIndex(h, (x) => x === 'text' || x === 'label' || x.startsWith('label ('));
    if (tc === -1) fail(`section ${sec.number}: table at line ${t.lineNo} has a Key but no Text`);
    const mc = headerIndex(h, (x) => x === 'max');
    const headerMax = /\(max (\d+)\)/i.exec(h[tc]);
    const cc = headerIndex(h, (x) => CONTEXT_HEADERS.includes(x));
    for (const r of t.rows) {
      const keyCell = r.cells[kc];
      const raw = r.cells[tc];
      if (backticked(keyCell)[0] === 'mod.reason.*') {
        parseModerationReasons(sections, table, r, sec);
        continue;
      }
      const ref = referenceOf(raw);
      if (ref) {
        table.references.push({ key: backticked(keyCell).join(' '), note: ref, line: r.lineNo });
        continue;
      }
      const max = mc !== -1 ? parseMax(r.cells[mc]) : headerMax ? Number(headerMax[1]) : null;
      for (const { key, text } of expandRow(keyCell, cleanText(raw), r.lineNo, labelMap)) {
        table.add(key, text, {
          section: sec.number,
          context: cc !== -1 ? r.cells[cc] : null,
          max,
          line: r.lineNo,
        });
      }
    }
  }
  // Prose definitions: `onb.progress` = "{n} of 6" (max 8)
  for (const l of sec.lines) {
    for (const m of l.text.matchAll(/`([a-z][a-z0-9_.]*)` = "([^"]+)"(?: \(max (\d+)\))?/g)) {
      if (!m[1].includes('.')) continue; // `wants` = "a drink" is catalog data, not a key
      table.add(m[1], m[2], {
        section: sec.number,
        context: null,
        max: m[3] ? Number(m[3]) : null,
        line: l.lineNo,
      });
    }
  }
}

function parseLevels(sections, table) {
  const sec = section(sections, '3');
  const prose = sec.lines.map((l) => l.text).join('\n');
  const lim = /Names are (\d+) characters or fewer; descriptions (\d+) or fewer/.exec(prose);
  if (!lim) fail('section 3 no longer states the level name limits');
  const [t] = parseTables(sec.lines);
  const levels = [];
  for (const r of t.rows) {
    const c = (name) => r.cells[headerIndex(t.headers, (x) => x.startsWith(name))];
    const [key] = backticked(c('key'));
    const level = Number(c('level'));
    table.add(key, c('name'), {
      section: '3',
      context: 'Level name',
      max: Number(lim[1]),
      line: r.lineNo,
    });
    table.add(`${key}.desc`, c('description'), {
      section: '3',
      context: 'Level description',
      max: Number(lim[2]),
      line: r.lineNo,
    });
    levels.push({ level, nameKey: key, descKey: `${key}.desc` });
  }
  return levels;
}

function parseNotifications(sections, table) {
  const sec = section(sections, '5');
  const prose = sec.lines.map((l) => l.text).join('\n');
  const lim = /\*\*title (\d+)\*\*, \*\*body (\d+)\*\*, \*\*action button (\d+)\*\*/.exec(prose);
  if (!lim) fail('section 5 no longer states the notification limits');
  const [titleMax, bodyMax, actionMax] = lim.slice(1).map(Number);
  const sent = section(sections, '5.1');
  const [t] = parseTables(sent.lines);
  const h = t.headers.map((x) => x.toLowerCase());
  const at = (r, name) => r.cells[h.indexOf(name)];
  const notifications = [];
  for (const r of t.rows) {
    const [key] = backticked(at(r, 'key'));
    const meta = (context, max) => ({ section: '5.1', context, max, line: r.lineNo });
    table.add(`${key}.title`, at(r, 'title'), meta(`${at(r, 'when')} (title)`, titleMax));
    const body = at(r, 'body');
    const hasBody = body !== '(none)';
    if (hasBody) table.add(`${key}.body`, body, meta(`${at(r, 'when')} (body)`, bodyMax));
    const actionsCell = at(r, 'actions');
    const actions =
      actionsCell === 'none'
        ? []
        : actionsCell.split(' · ').map((a) => {
            const label = a.replace(/\s*\(.*\)$/, '').trim();
            const actionKey = `n.action.${slug(label)}`;
            table.add(actionKey, label, meta('Notification action button', actionMax));
            return actionKey;
          });
    const sound = at(r, 'sound');
    notifications.push({
      key,
      titleKey: `${key}.title`,
      bodyKey: hasBody ? `${key}.body` : null,
      actionKeys: actions,
      sound: sound === 'Yes' ? true : sound === 'No' ? false : null,
    });
  }
  return notifications;
}

/** COPY.md 1.3: the banned words, phrases and the mechanical patterns QA rejects. */
function parseBanned(sections) {
  const sec = section(sections, '1.3');
  const terms = [];
  let mode = null;
  for (const l of sec.lines) {
    const t = l.text.trim();
    if (t === '**Words and phrases**') mode = 'words';
    else if (t === '**Patterns**') mode = 'patterns';
    else if (mode === 'words' && t.startsWith('- ')) {
      // Commas split items, except inside a parenthetical qualifier.
      const items = [];
      let depth = 0;
      let cur = '';
      for (const ch of t.slice(2)) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
          items.push(cur);
          cur = '';
        } else cur += ch;
      }
      items.push(cur);
      for (const raw of items) {
        const item = raw.trim();
        const q = /^(.*?)\s*\((.+)\)$/.exec(item);
        let phrase = (q ? q[1] : item).trim();
        // "Ready to...?" style items: the literal words before the ellipsis.
        phrase = phrase.replace(/\.\.\.\??$/, '').trim();
        if (!phrase) continue;
        terms.push({ phrase, qualifier: q ? q[2] : null, line: l.lineNo });
      }
    }
  }
  if (terms.length < 50) fail(`1.3 parsed only ${terms.length} banned terms`);
  const patterns = sec.lines.map((l) => l.text).join('\n');
  // The doc's admitting-no word list: "Words that admit someone said no: declined, …"
  const admits = /Words that admit someone said no: ([^.]+)\./.exec(patterns);
  if (!admits) fail('1.3 lost the "Words that admit someone said no" list');
  for (const w of admits[1].split(',')) {
    terms.push({ phrase: w.trim(), qualifier: 'admits someone said no', line: null });
  }
  return terms;
}

/** COPY.md 0.2: each variable's character budget and overflow rule. */
function parseVariables(sections) {
  const [t] = parseTables(section(sections, '0.2').lines);
  const out = {};
  for (const r of t.rows) {
    const budget = /^\d+$/.test(r.cells[2].trim()) ? Number(r.cells[2]) : null;
    for (const v of backticked(r.cells[0])) {
      out[v.replace(/^\{|\}$/g, '')] = { budget, budgetNote: r.cells[2], overflow: r.cells[3] };
    }
  }
  if (!out.name || out.name.budget == null) fail('0.2 lost the {name} budget');
  return out;
}

/** COPY.md 6: the widget overflow budgets ("`{name}` 12, `{place}` 18, `{group}` 14"). */
function parseWidgetBudgets(sections, variables) {
  const prose = section(sections, '6')
    .lines.map((l) => l.text)
    .join('\n');
  const m = /Variables use the widget overflow rules in 0\.2 \(([^)]+)\)/.exec(prose);
  if (!m) fail('section 6 lost the widget overflow rule sentence');
  const out = {};
  for (const v of m[1].matchAll(/`\{(\w+)\}`(?: (\d+))?/g)) {
    const budget = v[2] ? Number(v[2]) : variables[v[1]]?.budget;
    if (budget == null) fail(`widget budget for {${v[1]}} is unknown`);
    out[v[1]] = budget;
  }
  return out;
}

export function buildStrings(md = readCopy()) {
  const sections = splitSections(md);
  const table = new Table();
  const labelMap = optionLabelMap(sections);

  parseGenericTables(sections, section(sections, '2.8'), table, labelMap);
  const levels = parseLevels(sections, table);
  for (const n of ['4', '5', '6', '7']) {
    for (const sec of sectionsUnder(sections, n)) {
      if (sec.number === '5.1') continue;
      parseGenericTables(sections, sec, table, labelMap);
    }
  }
  const notifications = parseNotifications(sections, table);

  const entries = [...table.entries.values()].map((e) => ({
    ...e,
    placeholders: extractPlaceholders(e.text),
  }));
  for (const n of notifications) {
    for (const k of [n.titleKey, n.bodyKey, ...n.actionKeys]) {
      if (k && !table.entries.has(k)) fail(`notification ${n.key} points at missing ${k}`);
    }
  }
  return {
    entries,
    references: table.references,
    levels,
    notifications,
    banned: parseBanned(sections),
    variables: parseVariables(sections),
    widgetBudgets: parseWidgetBudgets(sections, parseVariables(sections)),
  };
}

function tsKey(k) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
}

function toTs(s) {
  const j = (v) => JSON.stringify(v, null, 2);
  const strings = Object.fromEntries(s.entries.map((e) => [e.key, e.text]));
  const meta = Object.fromEntries(
    s.entries.map((e) => [
      e.key,
      { section: e.section, context: e.context, max: e.max, placeholders: e.placeholders },
    ]),
  );
  const params = s.entries
    .map((e) => {
      if (e.placeholders.length === 0) return `  ${tsKey(e.key)}: Record<string, never>;`;
      const fields = e.placeholders
        .map((p) => `${tsKey(p.name)}: ${p.type === 'plural' ? 'number' : 'string | number'}`)
        .join('; ');
      return `  ${tsKey(e.key)}: { ${fields} };`;
    })
    .join('\n');
  return `// GENERATED by scripts/gen-strings.mjs from docs/COPY.md sections 1.3, 2.8 and 3 to 7.
// Do not edit. Change COPY.md, then run \`npm run gen -w @clink/shared\`.

export const STRINGS = ${j(strings)} as const;

export type StringKey = keyof typeof STRINGS;

/** Section, context, max length (null when COPY.md says "system" or "n/a") and placeholders. */
export const STRING_META: Record<
  StringKey,
  {
    section: string;
    context: string | null;
    max: number | null;
    placeholders: readonly { name: string; type: 'simple' | 'plural' | 'select' }[];
  }
> = ${j(meta)};

/** Variables each string takes, by key. Plural arguments are numbers. */
export interface StringParams {
${params}
}

/** Rows in COPY.md that point at other strings instead of defining one. */
export const STRING_REFERENCES = ${j(s.references)} as const;

export const LEVEL_STRING_KEYS = ${j(s.levels)} as const;

/** COPY.md 5.1: every notification, with its string keys and whether it plays a sound. */
export const NOTIFICATIONS = ${j(s.notifications)} as const;

/** COPY.md 0.2: character budget per variable (null when COPY.md gives none) and overflow rule. */
export const VARIABLE_BUDGETS = ${j(s.variables)} as const;

/** COPY.md 6: widget overflow budgets per variable. */
export const WIDGET_BUDGETS = ${j(s.widgetBudgets)} as const;

/** COPY.md 1.3 words and phrases. "qualifier" is the doc's context note, when it has one. */
export const BANNED_TERMS = ${j(s.banned)} as const;
`;
}

async function main() {
  const check = process.argv.includes('--check');
  const s = buildStrings();
  const json = {
    source: 'docs/COPY.md',
    strings: Object.fromEntries(s.entries.map((e) => [e.key, e.text])),
    meta: Object.fromEntries(
      s.entries.map((e) => [
        e.key,
        { section: e.section, max: e.max, placeholders: e.placeholders.map((p) => p.name) },
      ]),
    ),
    notifications: s.notifications,
  };
  const results = await Promise.all([
    writeOrCheck(OUT_TS, await prettierFormat(toTs(s), OUT_TS), check),
    writeOrCheck(OUT_JSON, await prettierFormat(JSON.stringify(json), OUT_JSON), check),
  ]);
  const stale = results.filter((r) => r.stale);
  if (stale.length) {
    console.error(
      `String table is out of date with docs/COPY.md: ${stale.map((r) => r.path).join(', ')}\n` +
        'Run: npm run gen -w @clink/shared',
    );
    process.exit(1);
  }
  if (!check) {
    console.log(
      `gen-strings: ${s.entries.length} strings, ${s.references.length} references, ` +
        `${s.notifications.length} notifications, ${s.banned.length} banned terms`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
