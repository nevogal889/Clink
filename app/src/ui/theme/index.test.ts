import * as theme from '@/ui/theme';

describe('theme tokens entry', () => {
  it('exposes every token group from docs/DESIGN.md 2', () => {
    expect(Object.keys(theme).sort()).toEqual(
      [
        'categoryColors',
        'colors',
        'elevation',
        'haptics',
        'motion',
        'radius',
        'spacing',
        'typography',
      ].sort(),
    );
  });
});
