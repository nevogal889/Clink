// A small ICU MessageFormat subset, enough for every string in COPY.md:
//   {name}                                    simple argument (names as written, "mm:ss" included)
//   {n, plural, =0 {…} one {# drink} other {# drinks}}   plural, with exact matches and #
//   {k, select, a {…} other {…}}              select
// Apostrophes are literal text. COPY.md never quotes braces, so ICU quoting isn't supported.

export type IcuNode =
  | { type: 'text'; value: string }
  | { type: 'arg'; name: string }
  | { type: 'pound' }
  | { type: 'plural'; name: string; branches: Record<string, IcuNode[]> }
  | { type: 'select'; name: string; branches: Record<string, IcuNode[]> };

export type IcuVars = Record<string, string | number>;

export function parseIcu(message: string): IcuNode[] {
  return parseNodes(message, false);
}

function parseNodes(msg: string, inPlural: boolean): IcuNode[] {
  const nodes: IcuNode[] = [];
  let text = '';
  let i = 0;
  const flush = () => {
    if (text) nodes.push({ type: 'text', value: text });
    text = '';
  };
  while (i < msg.length) {
    const ch = msg[i];
    if (ch === '{') {
      flush();
      const end = matchBrace(msg, i);
      nodes.push(parseArg(msg.slice(i + 1, end)));
      i = end + 1;
    } else if (ch === '}') {
      throw new Error(`Unbalanced "}" in: ${msg}`);
    } else if (ch === '#' && inPlural) {
      flush();
      nodes.push({ type: 'pound' });
      i++;
    } else {
      text += ch;
      i++;
    }
  }
  flush();
  return nodes;
}

function parseArg(inner: string): IcuNode {
  const comma = inner.indexOf(',');
  if (comma === -1) {
    const name = inner.trim();
    if (!name) throw new Error('Empty ICU argument');
    return { type: 'arg', name };
  }
  const name = inner.slice(0, comma).trim();
  const rest = inner.slice(comma + 1);
  const comma2 = rest.indexOf(',');
  const kind = (comma2 === -1 ? rest : rest.slice(0, comma2)).trim();
  if (kind !== 'plural' && kind !== 'select') {
    throw new Error(`Unsupported ICU argument type "${kind}" for {${name}}`);
  }
  const body = rest.slice(comma2 + 1);
  const branches: Record<string, IcuNode[]> = {};
  let k = 0;
  while (k < body.length) {
    while (k < body.length && /\s/.test(body[k] ?? '')) k++;
    if (k >= body.length) break;
    let selector = '';
    while (k < body.length && body[k] !== '{' && !/\s/.test(body[k] ?? '')) selector += body[k++];
    while (k < body.length && /\s/.test(body[k] ?? '')) k++;
    if (body[k] !== '{') throw new Error(`ICU branch "${selector}" of {${name}} has no message`);
    const end = matchBrace(body, k);
    branches[selector] = parseNodes(body.slice(k + 1, end), kind === 'plural');
    k = end + 1;
  }
  if (!branches.other) throw new Error(`ICU {${name}, ${kind}} has no "other" branch`);
  return { type: kind, name, branches };
}

function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced "{" in: ${s}`);
}

/** Every argument name in a parsed message, nested ones included, in first-seen order. */
export function argNames(
  nodes: IcuNode[],
): { name: string; type: 'simple' | 'plural' | 'select' }[] {
  const out: { name: string; type: 'simple' | 'plural' | 'select' }[] = [];
  const add = (name: string, type: 'simple' | 'plural' | 'select') => {
    const prev = out.find((p) => p.name === name);
    if (!prev) out.push({ name, type });
    else if (prev.type === 'simple' && type !== 'simple') prev.type = type;
  };
  const walk = (ns: IcuNode[]) => {
    for (const n of ns) {
      if (n.type === 'arg') add(n.name, 'simple');
      if (n.type === 'plural' || n.type === 'select') {
        add(n.name, n.type);
        for (const b of Object.values(n.branches)) walk(b);
      }
    }
  };
  walk(nodes);
  return out;
}

let pluralRules: Intl.PluralRules | null | undefined;

/** English plural category. Uses Intl when the engine has it, else the en rule (1 is "one"). */
export function pluralCategory(n: number): string {
  if (pluralRules === undefined) {
    try {
      pluralRules = typeof Intl !== 'undefined' ? new Intl.PluralRules('en-US') : null;
    } catch {
      pluralRules = null;
    }
  }
  if (pluralRules) return pluralRules.select(n);
  return n === 1 ? 'one' : 'other';
}

export function formatIcu(nodes: IcuNode[], vars: IcuVars, pound?: number): string {
  let out = '';
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
        out += n.value;
        break;
      case 'pound':
        out += pound === undefined ? '#' : String(pound);
        break;
      case 'arg':
        out += String(need(vars, n.name));
        break;
      case 'plural': {
        const value = Number(need(vars, n.name));
        if (!Number.isFinite(value)) throw new Error(`{${n.name}} must be a number`);
        const branch =
          n.branches[`=${value}`] ?? n.branches[pluralCategory(value)] ?? n.branches.other;
        out += formatIcu(branch ?? [], vars, value);
        break;
      }
      case 'select': {
        const value = String(need(vars, n.name));
        out += formatIcu(n.branches[value] ?? n.branches.other ?? [], vars, pound);
        break;
      }
    }
  }
  return out;
}

function need(vars: IcuVars, name: string): string | number {
  const v = vars[name];
  if (v === undefined || v === null) throw new Error(`Missing string variable {${name}}`);
  return v;
}
