// Elevation and where cards are allowed. Source: docs/DESIGN.md 2.7.
// Level 0 is everything by default. Level 1 is only for things that float: sheets, menus,
// snackbars. Cards (own background) are allowed only for: the order ticket, snap tiles and photo
// previews, a friend's incoming flare in the pager, one-off notices with an action.
import type { ViewStyle } from 'react-native';

import type { ColorMode } from './colors';

export const elevation: Record<ColorMode, { floating: ViewStyle }> = {
  light: {
    floating: {
      shadowColor: '#0E141B',
      shadowOpacity: 0.14,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
  },
  dark: {
    // No shadow in dark: surface.raised plus a 1 px top line in line.hairline.
    floating: { borderTopWidth: 1, borderTopColor: '#2A3542' },
  },
};

export const CARD_USES = ['orderTicket', 'snapTile', 'incomingFlare', 'notice'] as const;
