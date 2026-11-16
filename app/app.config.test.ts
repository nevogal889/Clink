import {
  apiChoice,
  assertShippable,
  publicSupabase,
  resolveVariant,
  variantSettings,
} from './app.config';

describe('app variants', () => {
  it('defaults to dev so local runs never use the store id', () => {
    expect(resolveVariant(undefined)).toBe('dev');
    expect(resolveVariant('')).toBe('dev');
  });

  it('rejects unknown variants', () => {
    expect(() => resolveVariant('staging')).toThrow('APP_VARIANT');
  });

  it('gives dev and prod different native ids', () => {
    const dev = variantSettings('dev');
    const prod = variantSettings('prod');
    expect(dev.bundleId).toBe(`${prod.bundleId}.dev`);
    expect(dev.scheme).not.toBe(prod.scheme);
    expect(dev.appGroup).toBe(`group.${dev.bundleId}.shared`);
    expect(prod.appGroup).toBe(`group.${prod.bundleId}.shared`);
  });

  it('blocks a production EAS build while the bundle id is a placeholder', () => {
    expect(() => assertShippable('prod', { EAS_BUILD: 'true' }, true)).toThrow('placeholder');
    expect(() => assertShippable('prod', { EAS_BUILD: 'true' }, false)).not.toThrow();
    expect(() => assertShippable('prod', {}, true)).not.toThrow();
    expect(() => assertShippable('dev', { EAS_BUILD: 'true' }, true)).not.toThrow();
  });
});

describe('public Supabase settings', () => {
  const projects = {
    dev: { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_dev' },
  };

  it('reads the variant from supabase/projects.json, env first', () => {
    expect(publicSupabase('dev', {}, projects)).toEqual(projects.dev);
    expect(
      publicSupabase(
        'dev',
        { SUPABASE_URL: 'https://xyz.supabase.co/', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' },
        projects,
      ),
    ).toEqual({ url: 'https://xyz.supabase.co', publishableKey: 'sb_publishable_x' });
    expect(publicSupabase('prod', {}, projects)).toBeNull();
  });

  it('refuses a secret key and a non-https URL', () => {
    expect(() =>
      publicSupabase('dev', { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' }, projects),
    ).toThrow('secret');
    expect(() =>
      publicSupabase('dev', { SUPABASE_URL: 'http://abc.supabase.co' }, projects),
    ).toThrow('https');
  });

  it('uses Supabase when configured, the mock when asked or when nothing is set', () => {
    const sb = projects.dev;
    expect(apiChoice({}, sb)).toBe('supabase');
    expect(apiChoice({ CLINK_API: 'mock' }, sb)).toBe('mock');
    expect(apiChoice({}, null)).toBe('mock');
    expect(() => apiChoice({ CLINK_API: 'supabase' }, null)).toThrow('no Supabase URL');
    expect(() => apiChoice({ CLINK_API: 'firebase' }, sb)).toThrow('CLINK_API');
  });
});
