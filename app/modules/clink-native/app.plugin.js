// Config plugin for clink-native (registered in app/app.config.ts). The module's own
// AndroidManifest.xml declares the widget receivers; this plugin only writes the public values
// the widget reads at runtime into <application> meta-data (ARCHITECTURE.md 8.5: the project URL
// and region are public by design). Nothing secret ever goes here. iOS needs nothing yet.
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

function withClinkNative(config) {
  return withAndroidManifest(config, (cfg) => {
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
