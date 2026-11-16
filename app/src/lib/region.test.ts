// The widget-api region in app config (app.config.ts publicRegion): public, and only ever the
// region of the project the URL points at.
import { publicRegion } from '../../app.config';

const projects = {
  dev: { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_x', region: 'eu-west-1' },
};
const sb = { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_x' };

describe('publicRegion', () => {
  it("takes the variant's region when the URL is that project's", () => {
    expect(publicRegion('dev', {}, projects, sb)).toBe('eu-west-1');
  });
  it("never gives another project's region to a SUPABASE_URL override", () => {
    const other = { ...sb, url: 'https://other.supabase.co' };
    expect(publicRegion('dev', {}, projects, other)).toBeNull();
    expect(publicRegion('dev', { SUPABASE_REGION: 'us-east-1' }, projects, other)).toBe(
      'us-east-1',
    );
  });
  it('is null without Supabase or with a malformed value', () => {
    expect(publicRegion('dev', {}, projects, null)).toBeNull();
    expect(publicRegion('dev', { SUPABASE_REGION: 'eu west' }, projects, sb)).toBeNull();
    expect(publicRegion('prod', {}, projects, sb)).toBeNull();
  });
});
