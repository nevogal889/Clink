// Reads docs/COPY.md into sections and tables. Used by scripts/gen-catalog.mjs and
// scripts/gen-strings.mjs. Plain Node, no dependencies, so it runs before `npm ci` finishes.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const COPY_PATH = join(REPO_ROOT, 'docs', 'COPY.md');

export function readCopy(path = COPY_PATH) {
  return readFileSync(path, 'utf8');
}

/**
 * Splits markdown into sections at every `##` and `###` heading.
 * Each section: { level, number, title, lines, startLine }.
 * `number` is the leading "4.1" / "2" of the heading, or null.
 */
export function splitSections(md) {
  const lines = md.split('\n');
  const sections = [];
  let current = { level: 1, number: null, title: '(preamble)', lines: [], startLine: 1 };
  let inFence = false;
  lines.forEach((line, i) => {
    if (line.startsWith('```')) inFence = !inFence;
    const m = !inFence && /^(#{2,3})\s+(.*)$/.exec(line);
    if (m) {
      sections.push(current);
      const title = m[2].trim();
      const num = /^(\d+(?:\.\d+)?)\.?\s+(.*)$/.exec(title);
      current = {
        level: m[1].length,
        number: num ? num[1] : null,
        title: num ? num[2] : title,
        lines: [],
        startLine: i + 1,
      };
    } else {
      current.lines.push({ text: line, lineNo: i + 1 });
    }
  });
  sections.push(current);
  return sections;
}

export function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

const SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/**
 * Finds every pipe table in a list of { text, lineNo } lines.
 * Returns [{ headers, rows: [{ cells, lineNo }], lineNo, before }] where `before` holds the
 * prose lines between the previous table (or section start) and this one.
 */
export function parseTables(lines) {
  const tables = [];
  let before = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].text;
    const next = lines[i + 1]?.text ?? '';
    if (line.trim().startsWith('|') && SEPARATOR.test(next.trim())) {
      const headers = splitRow(line);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].text.trim().startsWith('|')) {
        const cells = splitRow(lines[j].text);
        if (cells.length !== headers.length) {
          throw new Error(
            `COPY.md line ${lines[j].lineNo}: ${cells.length} cells, header has ${headers.length}`,
          );
        }
        rows.push({ cells, lineNo: lines[j].lineNo });
        j++;
      }
      tables.push({ headers, rows, lineNo: lines[i].lineNo, before });
      before = [];
      i = j - 1;
    } else {
      before.push(lines[i]);
    }
  }
  return tables;
}

/** Text inside the first pair of backticks, or every backticked token. */
export function backticked(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

/** Section lookup by number ("2.7"). Throws when missing, so a renamed heading fails loudly. */
export function section(sections, number) {
  const s = sections.find((x) => x.number === number);
  if (!s) throw new Error(`COPY.md has no section ${number}`);
  return s;
}

/** Every section whose number is `n` or starts with `n.`. */
export function sectionsUnder(sections, n) {
  return sections.filter((x) => x.number === n || (x.number && x.number.startsWith(`${n}.`)));
}

/**
 * Extracts ICU-style argument names from a message, as written ("name", "mm:ss").
 * Returns [{ name, type }] where type is "plural", "select" or "simple". Nested arguments
 * inside plural branches are included.
 */
export function extractPlaceholders(message) {
  const out = [];
  const add = (name, type) => {
    const prev = out.find((p) => p.name === name);
    if (prev) {
      if (prev.type === 'simple' && type !== 'simple') prev.type = type;
      return;
    }
    out.push({ name, type });
  };
  walk(message, add);
  return out;
}

function walk(msg, add) {
  let i = 0;
  while (i < msg.length) {
    if (msg[i] === '{') {
      const end = matchBrace(msg, i);
      const inner = msg.slice(i + 1, end);
      const comma = inner.indexOf(',');
      if (comma === -1) {
        add(inner.trim(), 'simple');
      } else {
        const name = inner.slice(0, comma).trim();
        const rest = inner.slice(comma + 1);
        const comma2 = rest.indexOf(',');
        const type = (comma2 === -1 ? rest : rest.slice(0, comma2)).trim();
        add(name, type === 'plural' || type === 'select' ? type : 'simple');
        if (comma2 !== -1) {
          // Branch bodies: "one {…} other {…}"
          const body = rest.slice(comma2 + 1);
          let k = 0;
          while (k < body.length) {
            if (body[k] === '{') {
              const e = matchBrace(body, k);
              walk(body.slice(k + 1, e), add);
              k = e + 1;
            } else k++;
          }
        }
      }
      i = end + 1;
    } else i++;
  }
}

export function matchBrace(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced braces in: ${s}`);
}

export function slug(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Writes `content` to `path`, or in check mode compares and reports drift. */
export async function writeOrCheck(path, content, check) {
  const { readFileSync: read, writeFileSync, mkdirSync, existsSync } = await import('node:fs');
  if (check) {
    const current = existsSync(path) ? read(path, 'utf8') : null;
    if (current !== content) {
      return { path, stale: true };
    }
    return { path, stale: false };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return { path, stale: false };
}

/** Formats generated TS or JSON with the repo's Prettier config, so format:check passes. */
export async function prettierFormat(content, filepath) {
  const prettier = await import('prettier');
  const options = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(content, { ...options, filepath });
}
