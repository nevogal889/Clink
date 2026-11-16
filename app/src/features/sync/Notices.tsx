// App-wide status pieces that sit over the screens.
// - NoticeHost: a snackbar the store queued for a later screen ("Welcome back, Dana." on the
//   camera after a returning sign-in, "Your account is deleted." on the splash screen). It waits
//   until that route is on top, so the route change doesn't dismiss it.
// - RetryLine: the one caption line over cached content when a refresh failed (DESIGN.md 4.21).
// - SessionGuard: a session that ends on its own (revoked, refresh refused) leaves the signed-in
//   screens for sign-in.
import { t } from '@clink/shared';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useData } from '@/lib/store';
import { Press } from '@/ui/controls';
import { useSnackbar } from '@/ui/Snackbar';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export function NoticeHost() {
  const { state, actions } = useData();
  const snack = useSnackbar();
  const pathname = usePathname();
  const notice = state.notice;
  useEffect(() => {
    if (!notice || pathname !== notice.on) return;
    // After the route's own layer is registered, so this route owns the snackbar.
    const id = setTimeout(() => {
      snack.show({
        text:
          notice.text === 'deleted'
            ? t('del.done')
            : t('signin.returning', { me: notice.name ?? '' }),
      });
      actions.clearNotice();
    }, 0);
    return () => clearTimeout(id);
  }, [notice, pathname, snack, actions]);
  return null;
}

export function RetryLine() {
  const { state, actions } = useData();
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  if (state.loadError !== 'stale') return null;
  return (
    <Press
      testID="retry-line"
      scaleTo={0.99}
      disabled={busy}
      accessibilityLabel={t('err.load')}
      onPress={async () => {
        setBusy(true);
        try {
          await actions.retryLoad();
        } finally {
          setBusy(false);
        }
      }}
      style={{
        minHeight: spacing.target,
        justifyContent: 'center',
        paddingHorizontal: spacing.gutter,
      }}
    >
      <Txt variant="caption" color={c.inkSecondary}>
        {t('err.load')}
      </Txt>
    </Press>
  );
}

/** Routes that work without a session. */
const OPEN_ROUTES = new Set(['/', '/sign-in', '/phone', '/code', '/age']);

export function SessionGuard() {
  const { state } = useData();
  const router = useRouter();
  const pathname = usePathname();
  const out = state.ready && !state.session && !OPEN_ROUTES.has(pathname);
  useEffect(() => {
    // Through the entry route, which knows about a refused age check.
    if (out) router.replace('/');
  }, [out, router]);
  return null;
}
