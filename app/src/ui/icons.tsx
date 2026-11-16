// UI glyphs on a 24 grid, 1.75 stroke, round caps and joins (DESIGN.md 2.8).
// MAPPING names the platform symbol each one stands for. Native builds swap these drawings for
// SF Symbols (expo-symbols) and Material Symbols Rounded; the web review build draws our own.
// Icon colour follows the text beside it, so every icon takes a colour.
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

export const MAPPING = {
  settings: { sf: 'gearshape', material: 'settings' },
  flip: { sf: 'arrow.triangle.2.circlepath', material: 'cameraswitch' },
  flashOn: { sf: 'bolt.fill', material: 'flash_on' },
  flashOff: { sf: 'bolt.slash', material: 'flash_off' },
  pencil: { sf: 'pencil', material: 'edit' },
  chevronDown: { sf: 'chevron.down', material: 'expand_more' },
  chevronRight: { sf: 'chevron.right', material: 'chevron_right' },
  check: { sf: 'checkmark', material: 'check' },
  plus: { sf: 'plus', material: 'add' },
  close: { sf: 'xmark', material: 'close' },
  share: { sf: 'square.and.arrow.up', material: 'share' },
  bubble: { sf: 'message', material: 'chat_bubble' },
  camera: { sf: 'camera', material: 'photo_camera' },
  grip: { sf: 'line.3.horizontal', material: 'drag_handle' },
  lock: { sf: 'lock', material: 'lock' },
  // Our own glyphs (DESIGN.md 2.8), drawn the same on both platforms.
  mug: { sf: null, material: null },
  tumbler: { sf: null, material: null },
  // The official WhatsApp glyph, unmodified (DESIGN.md 4.3 step 4).
  whatsapp: { sf: null, material: null },
} as const;

export type IconName = keyof typeof MAPPING;

const S = {
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
} as const;

function gearPath(): string {
  // Eight teeth around a ring, computed so the outline stays even.
  const teeth = 8;
  const rOut = 10;
  const rIn = 7.6;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (Math.PI * 2 * i) / (teeth * 2) - Math.PI / (teeth * 2) / 1.6;
    const a1 = (Math.PI * 2 * (i + 1)) / (teeth * 2) - Math.PI / (teeth * 2) / 1.6;
    const r = i % 2 === 0 ? rOut : rIn;
    pts.push(`${(12 + r * Math.cos(a0)).toFixed(2)} ${(12 + r * Math.sin(a0)).toFixed(2)}`);
    pts.push(`${(12 + r * Math.cos(a1)).toFixed(2)} ${(12 + r * Math.sin(a1)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
const GEAR = gearPath();

const WHATSAPP =
  'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z';

function Shape({ name, color }: { name: IconName; color: string }) {
  const st = { ...S, stroke: color };
  switch (name) {
    case 'settings':
      return (
        <>
          <Path d={GEAR} {...st} />
          <Circle cx={12} cy={12} r={3.2} {...st} />
        </>
      );
    case 'flip':
      return (
        <>
          <Path d="M4.5 11a7.5 7.5 0 0 1 13.2-4.6" {...st} />
          <Path d="M18.3 3.6v3.3H15" {...st} />
          <Path d="M19.5 13a7.5 7.5 0 0 1-13.2 4.6" {...st} />
          <Path d="M5.7 20.4v-3.3H9" {...st} />
        </>
      );
    case 'flashOn':
      return <Path d="M13 2.8 5.6 13.4h5.6L10.4 21.2l7.6-10.8h-5.7z" {...st} fill={color} />;
    case 'flashOff':
      return (
        <>
          <Path
            d="M13 2.8 9.6 7.7M8.2 9.7 5.6 13.4h5.6L10.4 21.2l3.4-4.8M15.6 13.1l2.4-2.7h-5.7l.5-4"
            {...st}
          />
          <Path d="M4 4l16 16" {...st} />
        </>
      );
    case 'pencil':
      return (
        <>
          <Path d="M15.5 4.5l4 4L9 19H5v-4z" {...st} />
          <Path d="M13.5 6.5l4 4" {...st} />
        </>
      );
    case 'chevronDown':
      return <Path d="M6 9.5l6 6 6-6" {...st} />;
    case 'chevronRight':
      return <Path d="M9.5 6l6 6-6 6" {...st} />;
    case 'check':
      return <Path d="M5 12.5l4.5 4.5L19 7.5" {...st} strokeWidth={2.25} />;
    case 'plus':
      return <Path d="M12 5v14M5 12h14" {...st} strokeWidth={2} />;
    case 'close':
      return <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...st} />;
    case 'share':
      return (
        <>
          <Path d="M12 3.5v11M8 7.5l4-4 4 4" {...st} />
          <Path d="M8.5 10.5H6.5v10h11v-10h-2" {...st} />
        </>
      );
    case 'bubble':
      return (
        <Path
          d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"
          {...st}
        />
      );
    case 'camera':
      return (
        <>
          <Path
            d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.6l1.6-2.2h5.6L16.4 7H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"
            {...st}
          />
          <Circle cx={12} cy={12.8} r={3.4} {...st} />
        </>
      );
    case 'grip':
      return <Path d="M5 8.5h14M5 12h14M5 15.5h14" {...st} />;
    case 'lock':
      return (
        <>
          <Path d="M6 11h12v9H6z" {...st} />
          <Path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" {...st} />
        </>
      );
    case 'mug':
      // V3 mug outline: straight walls, rim ellipse at 0.30, D handle.
      return (
        <>
          <Ellipse cx={10.5} cy={6.5} rx={6} ry={1.8} {...st} />
          <Path d="M4.5 6.5V17a6 1.8 0 0 0 12 0V6.5" {...st} />
          <Path d="M16.5 9h1.8a2.2 2.2 0 0 1 0 4.4h-1.8" {...st} />
        </>
      );
    case 'tumbler':
      // V4 tumbler: tapered glass with a water line.
      return (
        <>
          <Ellipse cx={12} cy={5.5} rx={6.5} ry={1.95} {...st} />
          <Path d="M5.5 5.5l1.4 13a5.1 1.5 0 0 0 10.2 0l1.4-13" {...st} />
          <Path d="M6.4 11.2a5.8 1.6 0 0 0 11.2 0" {...st} />
        </>
      );
    case 'whatsapp':
      return <Path d={WHATSAPP} fill={color} />;
  }
}

export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color: string }) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Shape name={name} color={color} />
      </Svg>
    </View>
  );
}
