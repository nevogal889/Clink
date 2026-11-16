// "The shelf" (DESIGN.md 4.1): the five category heroes standing on one cobalt ground line, left
// to right in category order. The one place all five appear together.
import { LOG_CATEGORIES } from '@clink/shared';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { Hero } from '@/ui/Art';
import { useTheme } from '@/ui/useTheme';

// Hero artboards are 1024 with the ground line at y 880.
const GROUND = 880 / 1024;

export function Shelf({ height }: { height: number }) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Each hero's subject fills about the middle 80% of its artboard. Size them so neighbours
  // just overlap their empty margins, and let the outer two run off the edges.
  const n = LOG_CATEGORIES.length;
  const size = Math.min(height / GROUND, width / 2.45);
  const step = (width + size * 0.3) / n;
  // The shelf is as tall as the heroes standing on it, so no empty band sits above them.
  const own = width > 0 ? Math.min(height, size * GROUND + 8) : height;
  const groundY = own - 8;

  return (
    <View onLayout={onLayout} style={{ height: own, overflow: 'hidden' }} testID="shelf">
      {width > 0
        ? LOG_CATEGORIES.map((cat, i) => {
            const left = i * step - size * 0.15 + (step - size) / 2;
            // Alternate a small rise so the row reads as objects on a shelf, not a strip.
            const top = groundY - size * GROUND;
            return (
              <View
                key={cat}
                style={{ position: 'absolute', left, top, zIndex: i % 2 === 0 ? 2 : 1 }}
              >
                <Hero category={cat} size={size} />
              </View>
            );
          })
        : null}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: groundY,
          height: 4,
          backgroundColor: c.cobalt,
        }}
      />
    </View>
  );
}
