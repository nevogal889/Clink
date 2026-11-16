// The generated catalog and string table must match docs/COPY.md, and the generators must
// refuse a COPY.md that breaks the rules. Runs the real scripts with Node.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../..');
const COPY = readFileSync(join(ROOT, 'docs/COPY.md'), 'utf8');

function buildWith(script: 'gen-strings' | 'gen-catalog', md: string) {
  const dir = mkdtempSync(join(tmpdir(), 'clink-copy-'));
  const path = join(dir, 'COPY.md');
  writeFileSync(path, md);
  const fn = script === 'gen-strings' ? 'buildStrings' : 'buildCatalog';
  const code = `
    import { readFileSync } from 'node:fs';
    import { ${fn} } from ${JSON.stringify(join(ROOT, 'scripts', `${script}.mjs`))};
    ${fn}(readFileSync(${JSON.stringify(path)}, 'utf8'));
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
}

describe('generated files are up to date with COPY.md', () => {
  it.each(['gen-catalog', 'gen-strings'])('%s --check passes', (script) => {
    expect(() =>
      execFileSync(process.execPath, [join(ROOT, 'scripts', `${script}.mjs`), '--check'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});

describe('generators refuse a broken COPY.md', () => {
  it('builds from the real COPY.md', () => {
    expect(buildWith('gen-strings', COPY).status).toBe(0);
    expect(buildWith('gen-catalog', COPY).status).toBe(0);
  });

  it('fails on a key defined twice with different text', () => {
    const md = COPY.replace(
      '| `splash.tagline` | Tagline | Drink breaks with your people. | 32 |',
      '| `splash.tagline` | Tagline | Drink breaks with your people. | 32 |\n| `splash.tagline` | Tagline | Something else. | 32 |',
    );
    expect(md).not.toBe(COPY);
    const r = buildWith('gen-strings', md);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('splash.tagline is defined twice');
  });

  it('fails when a drink references a field its category does not have', () => {
    const md = COPY.replace(
      '| Espresso | A short, strong shot of coffee | Yes | Espresso | Shots, Caffeine, Sweetness, Extras |',
      '| Espresso | A short, strong shot of coffee | Yes | Espresso | Shots, Grade, Sweetness, Extras |',
    );
    expect(md).not.toBe(COPY);
    const r = buildWith('gen-catalog', md);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('field "Grade" is not in the coffee option set');
  });

  it('fails when a preset names a drink that is not in the catalog', () => {
    const md = COPY.replace('| Latte, Americano, Cold Brew |', '| Latte, Americano, Frappé |');
    expect(md).not.toBe(COPY);
    const r = buildWith('gen-catalog', md);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('unknown drink "Frappé"');
  });
});
