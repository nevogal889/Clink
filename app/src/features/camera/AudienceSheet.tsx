// To: picker (DESIGN.md 4.5). Radio rows: Automatic with what it resolves to now, each group,
// Everyone. Tapping a row selects it and closes the sheet; no Done button. 2 taps.
import { t } from '@clink/shared';
import { View } from 'react-native';

import type { Audience, AudienceChoice } from '@/lib/api';
import { Press } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

import { resolveChoice } from './audience';

function same(a: AudienceChoice, b: AudienceChoice): boolean {
  return a.kind === b.kind && (a.kind !== 'group' || (b.kind === 'group' && a.id === b.id));
}

export function AudienceSheet({
  visible,
  audience,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  audience: Audience;
  value: AudienceChoice;
  onPick: (choice: AudienceChoice) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const auto = resolveChoice({ kind: 'auto' }, audience, new Date());
  const rows: { choice: AudienceChoice; title: string; sub: string; lead?: string; id: string }[] =
    [
      {
        id: 'auto',
        choice: { kind: 'auto' },
        title: t('aud.auto'),
        sub: t('aud.auto.sub', { audience: auto.label }),
      },
      ...audience.groups.map((g) => ({
        id: g.id,
        choice: { kind: 'group', id: g.id } as AudienceChoice,
        lead: g.emoji,
        title: g.name,
        sub:
          g.memberCount > 0 ? t('aud.group.sub', { n: g.memberCount }) : t('aud.group.empty_sub'),
      })),
      {
        id: 'everyone',
        choice: { kind: 'everyone' },
        title: t('aud.everyone'),
        sub: t('aud.everyone.sub', { n: audience.friendCount }),
      },
    ];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      detent="medium"
      title={t('aud.title')}
      testID="sheet-audience"
    >
      <View accessibilityRole="radiogroup">
        {rows.map((r, i) => {
          const selected = same(r.choice, value);
          return (
            <Press
              key={r.id}
              testID={`aud-${r.id}`}
              scaleTo={0.99}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={`${r.title}, ${r.sub}`}
              onPress={() => onPick(r.choice)}
              style={{
                minHeight: 64,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.s3,
                marginHorizontal: -spacing.gutter,
                paddingHorizontal: spacing.gutter,
                backgroundColor: selected ? c.cobaltTint : 'transparent',
                borderTopWidth: i === 0 || selected ? 0 : 1,
                borderTopColor: c.lineHairline,
              }}
            >
              {r.lead ? (
                <Txt variant="title" style={{ width: 32 }}>
                  {r.lead}
                </Txt>
              ) : null}
              <View style={{ flex: 1, paddingVertical: spacing.s2 }}>
                <Txt variant="headline">{r.title}</Txt>
                <Txt variant="callout" tone="secondary">
                  {r.sub}
                </Txt>
              </View>
              {selected ? <Icon name="check" size={22} color={c.cobalt} /> : null}
            </Press>
          );
        })}
      </View>
      <Txt variant="caption" tone="secondary" style={{ marginTop: spacing.s4 }}>
        {audience.groups.length > 0 ? t('aud.private') : t('aud.footer_nogroups')}
      </Txt>
    </Sheet>
  );
}
