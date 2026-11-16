// Core colours, light and dark. Source: docs/DESIGN.md 2.1 and 2.3.
// Keep values here only; components read them through useTheme() (./ThemeProvider).

export type ColorMode = 'light' | 'dark';

export interface CoreColors {
  surfaceBase: string;
  surfaceRaised: string;
  surfaceSunk: string;
  inkPrimary: string;
  inkSecondary: string;
  inkTertiary: string;
  lineHairline: string;
  lineControl: string;
  cobalt: string;
  onCobalt: string;
  cobaltTint: string;
  danger: string;
  onDanger: string;
  inverseSurface: string;
  inverseInk: string;
  inverseAction: string;
  /** scrim.photo base colour; the gradient runs 0% to 64% (DESIGN.md 3.6). */
  scrimPhoto: string;
  scrimModal: string;
  /** Disc behind camera controls: #0E141B at 56% (DESIGN.md 4.4). */
  cameraDisc: string;
  /** Viewfinder rim: line.control in light, surface.raised in dark (DESIGN.md 4.4). */
  viewfinderRim: string;
  /** Shutter ring and disc: ink.primary in light, white in dark (DESIGN.md 4.4). */
  shutter: string;
  /** What the viewfinder shows before a camera frame arrives. */
  cameraIdle: string;
}

export const colors: Record<ColorMode, CoreColors> = {
  light: {
    surfaceBase: '#F6F8F9',
    surfaceRaised: '#FFFFFF',
    surfaceSunk: '#E9EDF0',
    inkPrimary: '#17202A',
    inkSecondary: '#4A5563',
    inkTertiary: '#66727F',
    lineHairline: '#D5DCE2',
    lineControl: '#7D8995',
    cobalt: '#2443A6',
    onCobalt: '#FFFFFF',
    cobaltTint: '#E3E9F8',
    danger: '#A8301F',
    onDanger: '#FFFFFF',
    inverseSurface: '#17202A',
    inverseInk: '#F6F8F9',
    inverseAction: '#9DB2F2',
    scrimPhoto: '#0E141B',
    scrimModal: 'rgba(14,20,27,0.40)',
    cameraDisc: 'rgba(14,20,27,0.56)',
    viewfinderRim: '#7D8995',
    shutter: '#17202A',
    cameraIdle: '#0E141B',
  },
  dark: {
    surfaceBase: '#131A22',
    surfaceRaised: '#1B2430',
    surfaceSunk: '#0C1117',
    inkPrimary: '#EEF2F5',
    inkSecondary: '#A9B4BF',
    inkTertiary: '#8A96A2',
    lineHairline: '#2A3542',
    lineControl: '#66737F',
    cobalt: '#9DB2F2',
    onCobalt: '#0E1733',
    cobaltTint: '#1D2A4D',
    danger: '#F2A093',
    onDanger: '#1A0B08',
    inverseSurface: '#EEF2F5',
    inverseInk: '#131A22',
    inverseAction: '#2443A6',
    scrimPhoto: '#0E141B',
    scrimModal: 'rgba(0,0,0,0.55)',
    cameraDisc: 'rgba(14,20,27,0.56)',
    viewfinderRim: '#1B2430',
    shutter: '#FFFFFF',
    cameraIdle: '#0C1117',
  },
};
