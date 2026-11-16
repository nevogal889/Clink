#!/usr/bin/env node
// Generates the drink catalog from docs/COPY.md section 2 (2.2 to 2.8).
//
//   node scripts/gen-catalog.mjs           write packages/shared/src/catalog/catalog.generated.ts
//                                           and packages/shared/generated/catalog.json
//   node scripts/gen-catalog.mjs --check   exit 1 if either file is out of date (CI drift check)
//
// COPY.md stays the source. Never edit the generated files by hand.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  REPO_ROOT,
  backticked,
  parseTables,
  prettierFormat,
  readCopy,
  section,
  splitSections,
  writeOrCheck,
} from '../packages/shared/tools/copy-md.mjs';

const OUT_TS = join(REPO_ROOT, 'packages/shared/src/catalog/catalog.generated.ts');
const OUT_JSON = join(REPO_ROOT, 'packages/shared/generated/catalog.json');

const FLARE_CATEGORIES = ['coffee', 'matcha', 'tea', 'smoothie_juice'];
const CATEGORY_SECTIONS = { coffee: '2.2', matcha: '2.3', tea: '2.4', smoothie_juice: '2.5' };
// The option-set table headings in 2.7, by category key.
const OPTION_HEADINGS = {
  coffee: 'Coffee',
  matcha: 'Matcha',
  tea: 'Tea',
  smoothie_juice: 'Smoothie & Juice',
};
// "{cat}" / "{wants}" for categories whose drinks don't carry their own words (COPY.md 0.2).
const CATEGORY_WORD = { coffee: 'coffee', matcha: 'matcha', tea: 'tea' };

function fail(msg) {
  throw new Error(`gen-catalog: ${msg}`);
}

function col(headers, name) {
  const i = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  if (i === -1) fail(`missing column "${name}" in table with headers ${headers.join(', ')}`);
  return i;
}

function splitList(cell) {
  return cell
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Option sets from 2.7: shared lists, one table per category, and the free-text fields. */
function parseOptionSets(sec) {
  // Bold paragraph labels ("**Coffee**") precede each table.
  const tables = parseTables(sec.lines);
  const labelOf = (t) => {
    for (let k = t.before.length - 1; k >= 0; k--) {
      const m = /^\*\*(.+?)\*\*\s*$/.exec(t.before[k].text.trim());
      if (m) return m[1];
    }
    return null;
  };
  const byLabel = new Map(tables.map((t) => [labelOf(t), t]));

  const sharedTable = byLabel.get('Shared lists') ?? fail('2.7 has no "Shared lists" table');
  const shared = {};
  for (const r of sharedTable.rows) {
    const [name] = backticked(r.cells[0]);
    shared[name] = splitList(r.cells[1]);
  }

  const sets = {};
  for (const cat of FLARE_CATEGORIES) {
    const t = byLabel.get(OPTION_HEADINGS[cat]) ?? fail(`2.7 has no table for ${cat}`);
    const kc = col(t.headers, 'Key');
    const lc = col(t.headers, 'Label');
    const vc = col(t.headers, 'Values');
    sets[cat] = t.rows.map((r) => {
      const [key] = backticked(r.cells[kc]);
      if (!key) fail(`2.7 ${cat}: row without a key (line ${r.lineNo})`);
      const rawLabel = r.cells[lc];
      const multi = /\(any\)/.test(rawLabel);
      const label = rawLabel.replace(/\s*\(any\)\s*/, '').trim();
      const valuesCell = r.cells[vc];
      const ref = backticked(valuesCell);
      let values;
      if (ref.length === 1 && valuesCell.trim() === `\`${ref[0]}\``) {
        values = shared[ref[0]] ?? fail(`2.7 ${cat}.${key}: unknown list ${ref[0]}`);
        values = values.map((v) => ({ value: v }));
      } else {
        values = splitList(valuesCell).map((v) => {
          const only = /^(.*?)\s*\((.+?) only\)$/.exec(v);
          return only ? { value: only[1], onlyForName: only[2] } : { value: v };
        });
      }
      return { key, label, multi, values };
    });
  }

  const freeTable = byLabel.get('Every category') ?? fail('2.7 has no "Every category" table');
  const free = freeTable.rows.map((r) => {
    const [key] = backticked(r.cells[col(freeTable.headers, 'Key')]);
    const max = Number(/\d+/.exec(r.cells[freeTable.headers.findIndex((h) => /^Max/.test(h))])[0]);
    return { key, label: r.cells[col(freeTable.headers, 'Label')], max };
  });
  return { shared, sets, free };
}

/** Maps a "Fields" cell ("Size, Ice, Extras" or "All coffee fields") to option keys. */
function resolveFields(cell, cat, sets, drinkId) {
  const set = sets[cat];
  if (/^All .* fields$/.test(cell.trim())) return set.map((f) => f.key);
  const byLabel = new Map(set.map((f) => [f.label.toLowerCase(), f.key]));
  // The drink tables call Smoothie & Juice "Add-ins" by the shared word "Extras".
  byLabel.set('extras', 'extras');
  return splitList(cell).map((label) => {
    const key = byLabel.get(label.toLowerCase());
    if (!key) fail(`${drinkId}: field "${label}" is not in the ${cat} option set (COPY.md 2.7)`);
    return key;
  });
}

function parseDrinks(sections, sets) {
  const drinks = [];
  for (const cat of FLARE_CATEGORIES) {
    const sec = section(sections, CATEGORY_SECTIONS[cat]);
    const [t] = parseTables(sec.lines);
    if (!t) fail(`section ${sec.number} has no drink table`);
    const h = t.headers;
    const hasWords = h.some((x) => x.toLowerCase() === 'wants');
    for (const r of t.rows) {
      const c = (name) => r.cells[col(h, name)];
      const [id] = backticked(c('Id'));
      const [prefix, slug] = id.split('.');
      if (prefix !== cat) fail(`${id} is listed under ${cat}`);
      const caffeine = c('Caffeine');
      if (caffeine !== 'Yes' && caffeine !== 'No') fail(`${id}: Caffeine must be Yes or No`);
      const fields = resolveFields(c('Fields'), cat, sets, id);
      const hasTemp = sets[cat].some((f) => f.key === 'temp');
      drinks.push({
        id,
        category: cat,
        slug,
        name: c('App name'),
        description: c('Description'),
        caffeine: caffeine === 'Yes',
        widgetName: c('Widget name'),
        wants: hasWords ? c('wants') : CATEGORY_WORD[cat],
        label: hasWords ? c('label') : CATEGORY_WORD[cat],
        fields,
        // Drinks served only iced (COPY.md 2.2 to 2.4 notes): Ice is their own field and
        // Temperature isn't, so Ice shows without an Iced pick.
        alwaysIced: hasTemp && fields.includes('ice') && !fields.includes('temp'),
      });
    }
  }
  const water = section(sections, '2.6');
  const [wt] = parseTables(water.lines);
  for (const r of wt.rows) {
    const c = (name) => r.cells[col(wt.headers, name)];
    const [id] = backticked(c('Id'));
    const [prefix, slug] = id.split('.');
    if (prefix !== 'water') fail(`${id} is listed under water`);
    drinks.push({
      id,
      category: 'water',
      slug,
      name: c('App name'),
      description: c('Description'),
      caffeine: c('Caffeine') === 'Yes',
      widgetName: c('Widget name'),
      wants: null,
      label: null,
      fields: [],
      alwaysIced: false,
    });
  }
  return drinks;
}

function parseCustomWords(sections) {
  const words = {};
  for (const cat of FLARE_CATEGORIES)
    words[cat] = { wants: CATEGORY_WORD[cat], label: CATEGORY_WORD[cat] };
  const text = section(sections, '2.5')
    .lines.map((l) => l.text)
    .join('\n');
  const m = /custom drink in this category uses `wants` = "([^"]+)" and `label` = "([^"]+)"/.exec(
    text,
  );
  if (!m) fail('2.5 no longer states the custom drink words');
  words.smoothie_juice = { wants: m[1], label: m[2] };
  return words;
}

function parsePresets(sections, drinks) {
  const [t] = parseTables(section(sections, '2.8').lines);
  const byName = new Map(drinks.filter((d) => d.category !== 'water').map((d) => [d.name, d.id]));
  return t.rows.map((r) => {
    const [key] = backticked(r.cells[0]);
    const drinkIds = splitList(r.cells[col(t.headers, 'Drinks (#1, #2, #3)')]).map(
      (n) => byName.get(n) ?? fail(`${key}: unknown drink "${n}"`),
    );
    return { key, label: r.cells[1], drinkIds };
  });
}

export function buildCatalog(md = readCopy()) {
  const sections = splitSections(md);
  const { shared, sets, free } = parseOptionSets(section(sections, '2.7'));
  const drinks = parseDrinks(sections, sets);
  // Resolve "(Bubble Tea only)" to drink ids.
  for (const cat of FLARE_CATEGORIES) {
    for (const f of sets[cat]) {
      const onlyFor = {};
      for (const v of f.values) {
        if (!v.onlyForName) continue;
        const d = drinks.find((x) => x.category === cat && x.name === v.onlyForName);
        if (!d)
          fail(`2.7 ${cat}.${f.key}: "${v.value}" is limited to unknown drink ${v.onlyForName}`);
        onlyFor[v.value] = [d.id];
      }
      f.values = f.values.map((v) => v.value);
      // Values shown only for some drinks ("Tapioca pearls (Bubble Tea only)").
      f.onlyFor = onlyFor;
    }
  }
  return {
    categories: FLARE_CATEGORIES,
    sharedLists: shared,
    optionSets: sets,
    freeTextFields: free,
    drinks,
    customWords: parseCustomWords(sections),
    presets: parsePresets(sections, drinks),
  };
}

function toTs(cat) {
  const j = (v) => JSON.stringify(v, null, 2);
  return `// GENERATED by scripts/gen-catalog.mjs from docs/COPY.md section 2. Do not edit.
// Change COPY.md, then run \`npm run gen -w @clink/shared\`.

export const FLARE_CATEGORIES = ${j(cat.categories)} as const;

export const SHARED_LISTS = ${j(cat.sharedLists)} as const;

export const OPTION_SETS = ${j(cat.optionSets)} as const;

export const FREE_TEXT_FIELDS = ${j(cat.freeTextFields)} as const;

export const DRINKS = ${j(cat.drinks)} as const;

export const CUSTOM_DRINK_WORDS = ${j(cat.customWords)} as const;

export const PRESETS = ${j(cat.presets)} as const;
`;
}

async function main() {
  const check = process.argv.includes('--check');
  const cat = buildCatalog();
  const results = await Promise.all([
    writeOrCheck(OUT_TS, await prettierFormat(toTs(cat), OUT_TS), check),
    writeOrCheck(
      OUT_JSON,
      await prettierFormat(JSON.stringify({ source: 'docs/COPY.md section 2', ...cat }), OUT_JSON),
      check,
    ),
  ]);
  const stale = results.filter((r) => r.stale);
  if (stale.length) {
    console.error(
      `Catalog is out of date with docs/COPY.md: ${stale.map((r) => r.path).join(', ')}\n` +
        'Run: npm run gen -w @clink/shared',
    );
    process.exit(1);
  }
  if (!check) {
    console.log(`gen-catalog: ${cat.drinks.length} drinks, ${cat.presets.length} presets`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
