// Name and photo (onboarding step 2, profile Edit). Photo is optional; initials are the fallback.
import { TEXT_LIMITS, charLength, t } from '@clink/shared';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/ui/Avatar';
import { Field, IconButton, TextButton } from '@/ui/controls';
import { Sheet } from '@/ui/Sheet';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export function isNameValid(name: string): boolean {
  const n = charLength(name.trim());
  return n >= 1 && n <= TEXT_LIMITS.displayName;
}

export function NamePhotoEditor({
  name,
  photoUri,
  onName,
  onPhoto,
  onSubmit,
}: {
  name: string;
  photoUri: string | null;
  onName: (v: string) => void;
  onPhoto: (uri: string | null) => void;
  onSubmit?: () => void;
}) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const [menu, setMenu] = useState(false);
  const wide = width >= 375;

  async function pick(source: 'camera' | 'library') {
    setMenu(false);
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      exif: false,
    };
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
    const uri = !res.canceled ? res.assets[0]?.uri : undefined;
    if (uri) onPhoto(uri);
  }

  const photoLabel = photoUri ? t('onb.photo.change') : t('onb.photo.add');

  return (
    <View
      style={{
        flexDirection: wide ? 'row' : 'column',
        gap: spacing.s5,
        alignItems: wide ? 'center' : 'flex-start',
      }}
    >
      <View style={{ width: 96, height: 96 }}>
        <Avatar name={name} photoUri={photoUri} size={96} />
        <View style={{ position: 'absolute', right: -8, bottom: -8 }}>
          <IconButton
            testID="photo-button"
            name="camera"
            size={20}
            color={c.onCobalt}
            disc={c.cobalt}
            accessibilityLabel={photoLabel}
            onPress={() => (Platform.OS === 'web' && !photoUri ? pick('library') : setMenu(true))}
          />
        </View>
      </View>
      <View style={{ flex: wide ? 1 : undefined, alignSelf: 'stretch', gap: spacing.s2 }}>
        <Field
          testID="name-field"
          value={name}
          onChangeText={onName}
          placeholder={t('onb.name.field')}
          maxLength={TEXT_LIMITS.displayName}
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
        <Txt variant="caption" tone="secondary">
          {t('onb.name.helper')}
        </Txt>
      </View>

      <Sheet visible={menu} onClose={() => setMenu(false)} detent="small" testID="sheet-photo">
        <View style={{ paddingBottom: spacing.s2 }}>
          {Platform.OS !== 'web' ? (
            <TextButton label={t('onb.photo.take')} onPress={() => pick('camera')} />
          ) : null}
          <TextButton label={t('onb.photo.library')} onPress={() => pick('library')} />
          {photoUri ? (
            <TextButton
              danger
              label={t('onb.photo.remove')}
              onPress={() => {
                setMenu(false);
                onPhoto(null);
              }}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
