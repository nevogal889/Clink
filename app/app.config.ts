import type { ConfigContext, ExpoConfig } from 'expo/config';

// Everything lives in this file because the Expo config loader does not resolve TS imports.

// App variants. docs/ARCHITECTURE.md 10: `dev` serves local, development and preview builds
// against the dev backend; `prod` is the store build against the prod backend. The two can sit on
// one phone because every native id differs.

/**
 * PLACEHOLDER. The real base is the reverse of the domain we buy (docs/PRD.md 8, question 4).
 * Bundle ids can never change after the first store upload, so a production EAS build refuses to
 * run while this placeholder is in place (see `assertShippable` below).
 */
export const BUNDLE_ID_BASE = 'com.example.clink';
export const BUNDLE_ID_IS_PLACEHOLDER = true;

export const VARIANTS = ['dev', 'prod'] as const;
export type Variant = (typeof VARIANTS)[number];

export interface VariantSettings {
  variant: Variant;
  /** Home-screen name. Brand name, not UI copy. */
  name: string;
  bundleId: string;
  /** Custom scheme for the dev client and Expo Router only. Invites use https (ARCHITECTURE 8.7). */
  scheme: string;
  /** App Group shared by the app, the widget and the Notification Service Extension. */
  appGroup: string;
}

export function resolveVariant(raw: string | undefined): Variant {
  if (raw === undefined || raw === '') return 'dev';
  if ((VARIANTS as readonly string[]).includes(raw)) return raw as Variant;
  throw new Error(`APP_VARIANT must be one of ${VARIANTS.join(', ')}; got "${raw}".`);
}

export function variantSettings(variant: Variant): VariantSettings {
  const bundleId = variant === 'prod' ? BUNDLE_ID_BASE : `${BUNDLE_ID_BASE}.dev`;
  return {
    variant,
    name: variant === 'prod' ? 'Clink' : 'Clink Dev',
    bundleId,
    scheme: variant === 'prod' ? 'clink' : 'clink-dev',
    appGroup: `group.${bundleId}.shared`,
  };
}

/** Throws when a store build would ship with the placeholder bundle id. */
export function assertShippable(
  variant: Variant,
  env: Record<string, string | undefined>,
  isPlaceholder: boolean = BUNDLE_ID_IS_PLACEHOLDER,
): void {
  const isEasBuild = env.EAS_BUILD === 'true' || env.EAS_BUILD === '1';
  if (variant === 'prod' && isEasBuild && isPlaceholder) {
    throw new Error(
      'Production build blocked: BUNDLE_ID_BASE in app/app.config.ts is still a placeholder. ' +
        'Set it from the purchased domain first (docs/ARCHITECTURE.md 10).',
    );
  }
}

// Minimum OS (CLAUDE.md "Stack"): iOS 17.2, Android 8.0 (API 26).
const IOS_DEPLOYMENT_TARGET = '17.2';
const ANDROID_MIN_SDK = 26;

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant(process.env.APP_VARIANT);
  assertShippable(variant, process.env);
  const v = variantSettings(variant);

  // Set once the Expo account exists (docs/ARCHITECTURE.md 12). Public by design.
  const easProjectId = process.env.EAS_PROJECT_ID;

  return {
    ...config,
    name: v.name,
    // Expo account that owns the EAS project (the CEO's personal account for now).
    owner: 'nevogal',
    slug: 'clink',
    version: '0.1.0',
    orientation: 'portrait',
    scheme: v.scheme,
    userInterfaceStyle: 'automatic',
    runtimeVersion: { policy: 'fingerprint' },
    ...(easProjectId ? { updates: { url: `https://u.expo.dev/${easProjectId}` } } : {}),
    ios: {
      bundleIdentifier: v.bundleId,
      deploymentTarget: IOS_DEPLOYMENT_TARGET,
      supportsTablet: false,
    },
    android: {
      package: v.bundleId,
    },
    web: {
      bundler: 'metro',
      output: 'single',
    },
    plugins: [
      'expo-router',
      'expo-status-bar',
      ['expo-build-properties', { android: { minSdkVersion: ANDROID_MIN_SDK } }],
    ],
    experiments: {
      reactCompiler: true,
    },
    extra: {
      variant: v.variant,
      appGroup: v.appGroup,
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
  };
};
