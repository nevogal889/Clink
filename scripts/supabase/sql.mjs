// Small SQL text helpers for the Management API scripts: split a script into top-level statements
// (respecting quotes, dollar quotes and comments), and parse pgTAP output.

/**
 * Splits SQL text into top-level statements at semicolons that are not inside a string, quoted
 * identifier, dollar-quoted body or comment. Returns trimmed statements without the trailing `;`,
 * empty ones dropped. Comments stay attached to the statement that follows them.
 */
export function splitStatements(sql) {
  const out = [];
  let start = 0;
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? n : end + 1;
    } else if (c === '/' && next === '*') {
      // Postgres block comments nest.
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else i++;
      }
    } else if (c === "'") {
      // E'...' strings treat backslash as an escape.
      const escaped = i > 0 && /[eE]/.test(sql[i - 1]) && !/[\w$]/.test(sql[i - 2] ?? ' ');
      i++;
      while (i < n) {
        if (escaped && sql[i] === '\\') i += 2;
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i++;
          break;
        } else i++;
      }
    } else if (c === '"') {
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') {
          i++;
          break;
        } else i++;
      }
    } else if (c === '$' && !/[\w$]/.test(sql[i - 1] ?? ' ')) {
      const m = /^\$([A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end < 0 ? n : end + tag.length;
      } else i++;
    } else if (c === ';') {
      const s = sql.slice(start, i).trim();
      if (s && !isOnlyComments(s)) out.push(s);
      i++;
      start = i;
    } else i++;
  }
  const tail = sql.slice(start).trim();
  if (tail && !isOnlyComments(tail)) out.push(tail);
  return out;
}

/** True when the text holds nothing but whitespace and comments. */
export function isOnlyComments(s) {
  return stripLeadingComments(s) === '';
}

/** Removes leading whitespace and comments. */
export function stripLeadingComments(s) {
  let t = s;
  for (;;) {
    t = t.replace(/^\s+/, '');
    if (t.startsWith('--')) {
      const end = t.indexOf('\n');
      t = end < 0 ? '' : t.slice(end + 1);
    } else if (t.startsWith('/*')) {
      const end = t.indexOf('*/');
      t = end < 0 ? '' : t.slice(end + 2);
    } else return t;
  }
}

/** First keyword of a statement, lower case ('select', 'with', 'begin', ...). */
export function firstKeyword(stmt) {
  const m = /^([A-Za-z]+)/.exec(stripLeadingComments(stmt));
  return m ? m[1].toLowerCase() : '';
}

/**
 * Parses pgTAP output lines (TAP 13 as pgTAP writes it). Diagnostics after a `not ok` line belong
 * to that test.
 */
export function parseTap(lines) {
  const text = lines.join('\n').split('\n');
  let planned = null;
  let passed = 0;
  let failed = 0;
  const failures = [];
  const notes = [];
  let current = null;
  for (const line of text) {
    const planM = /^1\.\.(\d+)/.exec(line);
    const okM = /^(not )?ok (\d+)( - (.*))?/.exec(line);
    if (planM) planned = Number(planM[1]);
    else if (okM) {
      current = null;
      if (okM[1]) {
        failed++;
        current = { number: Number(okM[2]), description: okM[4] ?? '', diag: [] };
        failures.push(current);
      } else passed++;
    } else if (line.startsWith('#')) {
      if (current && !line.startsWith('# Looks like')) current.diag.push(line);
      else notes.push(line);
    }
  }
  const ran = passed + failed;
  const ok = failed === 0 && planned !== null && planned === ran;
  return { planned, passed, failed, ran, ok, failures, notes };
}
