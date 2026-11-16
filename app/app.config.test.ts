import { assertShippable, resolveVariant, variantSettings } from './app.config';

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
