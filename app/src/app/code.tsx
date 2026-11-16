// Code screen (DESIGN.md 4.2, PRD 3.1 rules 3 and 4). Six boxes over one field with one-time-code
// autofill; it submits by itself on the 6th digit. Resend after 30 s. Also the re-confirm step
// before account deletion (`?mode=reauth`, DESIGN.md 4.20 step 3).
import { t } from '@clink/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, TextInput, View, type TextInputInstance } from 'react-native';

import { errorText, isApiError } from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import { useData } from '@/lib/store';
import { AuthFrame, ErrorLine } from '@/features/signin/AuthFrame';
import { TextButton } from '@/ui/controls';
import { radius, spacing, typography } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

const LENGTH = 6;
const RESEND_SEC = 30;
/** "No code yet?" shows once the resend wait is over (COPY.md 4.1, `code.slow`). */
const SLOW_SEC = RESEND_SEC;

function mss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export default function CodeScreen() {
  const router = useRouter();
  const { phone = '', mode } = useLocalSearchParams<{ phone: string; mode?: string }>();
  const reauth = mode === 'reauth';
  const { api, actions } = useData();
  const { c } = useTheme();
  const input = useRef<TextInputInstance>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const waited = Math.floor((nowMs - sentAt) / 1000);
  const resendIn = Math.max(0, RESEND_SEC - waited);

  async function submit(value: string) {
    if (busy || locked) return;
    setBusy(true);
    setError(null);
    try {
      if (reauth) {
        await api.verifyPhoneCode(phone, value);
        await actions.deleteAccount();
        router.replace('/sign-in');
      } else {
        await actions.verifyCode(phone, value);
        // Signed in: the number and code screens leave the history, so back never returns to them.
        if (router.canDismiss()) router.dismissAll();
        router.replace('/');
      }
    } catch (e) {
      if (isApiError(e, 'code_locked')) setLocked(true);
      setError(errorText(e, reauth ? 'del.error' : 'err.signin_failed'));
      setCode('');
      setBusy(false);
      input.current?.focus();
    }
  }

  async function resend() {
    setError(null);
    try {
      await actions.sendCode(phone);
      setSentAt(Date.now());
      setNowMs(Date.now());
    } catch (e) {
      setError(errorText(e, 'err.signin_failed'));
    }
  }

  const digits = code.split('');
  const rim = error ? c.danger : 'transparent';
  return (
    <AuthFrame
      testID="screen-code"
      title={t('code.title')}
      sub={t('code.sub', { phone: formatPhone(phone) })}
    >
      <View
        style={{ height: 64, justifyContent: 'center' }}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <View style={{ flexDirection: 'row', gap: spacing.s2 }}>
          {Array.from({ length: LENGTH }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 64,
                borderRadius: radius.field,
                borderCurve: 'continuous',
                backgroundColor: c.surfaceSunk,
                borderWidth: 2,
                borderColor: i === code.length && !error && !locked ? c.cobalt : rim,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt variant="title" style={{ fontVariant: ['tabular-nums'] }}>
                {digits[i] ?? ''}
              </Txt>
            </View>
          ))}
        </View>
      </View>
      {/* One real field over the boxes, so autofill, paste and screen readers see one input. */}
      <TextInput
        ref={input}
        testID="code-input"
        value={code}
        editable={!locked && !busy}
        onChangeText={(v) => {
          const next = v.replace(/\D/g, '').slice(0, LENGTH);
          setCode(next);
          if (next.length > 0) setError((e) => (locked ? e : null));
          if (next.length === LENGTH) void submit(next);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        autoFocus
        maxLength={LENGTH}
        accessibilityLabel={t('code.field')}
        caretHidden
        style={
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 64,
            opacity: 0.02,
            color: 'transparent',
            fontSize: typography.title.fontSize,
            outlineStyle: 'none',
          } as never
        }
      />
      <ErrorLine text={error} testID="code-error" />
      {waited >= SLOW_SEC && !error ? (
        <Txt variant="callout" tone="secondary">
          {t('code.slow')}
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s4 }}>
        <TextButton
          testID="code-resend"
          label={resendIn > 0 ? t('code.resend_wait', { 'm:ss': mss(resendIn) }) : t('code.resend')}
          disabled={resendIn > 0 || busy}
          onPress={resend}
        />
        {reauth ? null : (
          <TextButton
            testID="code-wrong-number"
            label={t('code.wrong_number')}
            onPress={() => router.back()}
          />
        )}
      </View>
    </AuthFrame>
  );
}
