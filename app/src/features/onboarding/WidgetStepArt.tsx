// Small home-screen drawings beside each add-widget step (DESIGN.md 4.3 step 6). They are a still
// frame; the looping 3 s versions built from real widget renders come with the widget targets
// (M2). Decorative: the step text next to each one carries the meaning.
import Svg, { Circle, Rect } from 'react-native-svg';
import { View } from 'react-native';

import { useTheme } from '@/ui/useTheme';

const W = 64;
const H = 104;

export function WidgetStepArt({ step, look }: { step: 1 | 2 | 3; look: 'ios' | 'android' }) {
  const { c } = useTheme();
  const frame = c.inkSecondary;
  const tile = c.lineHairline;
  const apps: { x: number; y: number }[] = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) apps.push({ x: 10 + col * 16, y: 16 + row * 17 });

  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Rect x={1} y={1} width={W - 2} height={H - 2} rx={12} fill={c.surfaceRaised} stroke={frame} strokeWidth={1.75} />
        {step === 3
          ? (
            <>
              <Rect x={8} y={14} width={48} height={24} rx={6} fill={c.cobaltTint} />
              <Rect x={8} y={14} width={48} height={4} rx={2} fill={c.cobalt} />
              {apps.slice(6).map((a, i) => (
                <Rect key={i} x={a.x} y={a.y} width={12} height={12} rx={3.5} fill={tile} />
              ))}
            </>
          )
          : apps.map((a, i) => <Rect key={i} x={a.x} y={a.y} width={12} height={12} rx={3.5} fill={tile} />)}
        {step === 1 ? (
          <>
            <Circle cx={40} cy={88} r={9} fill="none" stroke={c.cobalt} strokeWidth={2} />
            <Circle cx={40} cy={88} r={3.5} fill={c.cobalt} />
          </>
        ) : null}
        {step === 2 && look === 'ios' ? <Rect x={7} y={5} width={16} height={7} rx={3.5} fill={c.cobalt} /> : null}
        {step === 2 && look === 'android' ? (
          <>
            <Rect x={1} y={66} width={W - 2} height={37} rx={10} fill={c.cobaltTint} stroke={frame} strokeWidth={1.75} />
            <Rect x={12} y={78} width={18} height={14} rx={3} fill={c.cobalt} />
            <Rect x={34} y={78} width={18} height={14} rx={3} fill={tile} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
