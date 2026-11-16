import { t } from '@clink/shared';

import { ApiError, errorCode, errorText, isApiError } from './errors';

describe('errorText', () => {
  it('gives each code its COPY.md line', () => {
    expect(errorText(new ApiError('code_wrong'))).toBe(t('err.code_wrong'));
    expect(errorText(new ApiError('code_expired'))).toBe(t('err.code_expired'));
    expect(errorText(new ApiError('code_locked', { retryAfterSec: 14 * 60 + 5 }))).toBe(
      t('err.code_locked', { n: 15 }),
    );
    expect(errorText(new ApiError('phone_invalid'))).toBe(t('err.phone_invalid'));
    expect(errorText(new ApiError('phone_taken'))).toBe(t('err.phone_taken'));
    expect(errorText(new ApiError('text_blocked'))).toBe(t('err.text_blocked'));
    expect(errorText(new ApiError('rate_limited', { retryAfterSec: 90 }))).toBe(
      t('rl.generic', { n: 2 }),
    );
    expect(errorText(new ApiError('flare_ended'))).toBe(t('err.flare_ended'));
    expect(errorText(new ApiError('no_friends'))).toBe(t('err.no_friends'));
    expect(errorText(new ApiError('sms_failed'))).toBe(t('err.signin_failed'));
  });

  it('falls back to the screen’s own line', () => {
    expect(errorText(new ApiError('network'))).toBe(t('err.generic'));
    expect(errorText(new ApiError('server'), 'del.error')).toBe(t('del.error'));
    expect(errorText(new Error('vendor'), 'err.signin_failed')).toBe(t('err.signin_failed'));
  });

  it('reads codes', () => {
    expect(isApiError(new ApiError('network'), 'network')).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(errorCode(new Error('x'))).toBe('server');
    expect(new ApiError('under_age', { min: 16 }).min).toBe(16);
  });
});
