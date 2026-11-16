// Config plugin for clink-native (registered in app/app.config.ts). The module's own
// AndroidManifest.xml declares the widget receivers; this plugin writes the public values the
// widget reads at runtime into <application> meta-data (ARCHITECTURE.md 8.5: the project URL and
// region are public by design) and turns Android backup off. Nothing secret ever goes here. iOS
// needs nothing yet.
//
// Backup (CTO decision, polish pass 2026-11-16): android:allowBackup="false" and data extraction
// rules that exclude everything, so neither Auto Backup nor an Android 12+ device transfer copies
// the widget store (token, friends' names and places). All user data lives on the server.
const fs = require('node:fs');
const path = require('node:path');

const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const META = {
  functionsUrl: 'app.clink.FUNCTIONS_URL',
  region: 'app.clink.REGION',
  scheme: 'app.clink.SCHEME',
};

/** The variant's region from supabase/projects.json, or null. */
function readRegion(projectRoot, variant) {
  try {
    const file = path.join(projectRoot, '..', 'supabase', 'projects.json');
    const projects = JSON.parse(fs.readFileSync(file, 'utf8'));
    const region = projects?.[variant]?.region;
    return typeof region === 'string' && /^[a-z]{2}-[a-z]+-\d$/.test(region) ? region : null;
  } catch {
    return null;
  }
}

/** The meta-data values for a resolved Expo config. Exported for tests. */
function widgetMetaValues(config, projectRoot) {
  const extra = config.extra ?? {};
  const url = extra.supabase?.url;
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  return {
    [META.functionsUrl]:
      typeof url === 'string' && url.startsWith('https://')
        ? `${url.replace(/\/$/, '')}/functions/v1`
        : null,
    [META.region]: url ? readRegion(projectRoot, extra.variant ?? 'dev') : null,
    [META.scheme]: typeof scheme === 'string' && scheme ? scheme : null,
  };
}

/** The <application> attributes for backup. Exported for tests. */
const BACKUP_ATTRS = {
  'android:allowBackup': 'false',
  'android:dataExtractionRules': '@xml/clink_data_extraction_rules',
};

/** Turns backup off on a parsed AndroidManifest (the modResults object). Exported for tests. */
function applyNoBackup(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  Object.assign(app.$, BACKUP_ATTRS);
  // A library that declares allowBackup must not win the manifest merge.
  manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const replace = new Set((app.$['tools:replace'] ?? '').split(',').filter(Boolean));
  for (const k of Object.keys(BACKUP_ATTRS)) replace.add(k);
  app.$['tools:replace'] = [...replace].join(',');
  return manifest;
}

function withClinkNative(config) {
  // Expo's own allowBackup mod reads this, so both agree.
  config.android = { ...config.android, allowBackup: false };
  return withAndroidManifest(config, (cfg) => {
    applyNoBackup(cfg.modResults);
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const values = widgetMetaValues(cfg, cfg.modRequest.projectRoot);
    for (const [name, value] of Object.entries(values)) {
      if (value) AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, name, value);
      else AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(app, name);
    }
    return cfg;
  });
}

module.exports = withClinkNative;
module.exports.widgetMetaValues = widgetMetaValues;
module.exports.applyNoBackup = applyNoBackup;
module.exports.BACKUP_ATTRS = BACKUP_ATTRS;
