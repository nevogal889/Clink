// The invite meter fills at 2, then keeps counting invites sent with no ceiling (DECISIONS.md).
import { t } from '@clink/shared';
import { render, screen } from '@testing-library/react-native';

import { InviteMeter } from './InviteShare';

describe('InviteMeter', () => {
  it.each([0, 1, 2])('shows "%i of 2" up to the goal', async (n) => {
    await render(<InviteMeter filled={n} />);
    expect(screen.getByText(t('onb.invite.meter', { n }))).toBeTruthy();
    expect(screen.getByTestId('invite-meter').props.accessibilityValue).toEqual({
      min: 0,
      max: 2,
      now: n,
    });
  });

  it.each([3, 7, 25])('keeps counting past the goal with no ceiling (%i)', async (n) => {
    await render(<InviteMeter filled={n} />);
    const label = t('onb.invite.meter_more', { n });
    expect(label).toContain(String(n));
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByTestId('invite-meter').props.accessibilityLabel).toBe(label);
  });
});
