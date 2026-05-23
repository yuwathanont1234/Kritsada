/**
 * withTabletSupport — Expo config plugin
 *
 * Problem: when the manifest declares android.permission.CAMERA, Android
 * implicitly treats it as <uses-feature android:name="android.hardware.camera"
 * android:required="true" />. Google Play then filters the app off any device
 * that doesn't report a back camera — including a large slice of Wi-Fi-only
 * tablets and budget tablets that only have a front camera.
 *
 * Fix: explicitly declare the camera-related features as `required="false"`
 * so Google Play stops filtering by them. Runtime code already handles the
 * "no camera" case gracefully (CameraScreen falls back to image-picker on
 * devices without the hardware), so making this optional is safe.
 *
 * Features we mark optional:
 *   - android.hardware.camera             (back camera; many tablets miss)
 *   - android.hardware.camera.autofocus   (autofocus; some tablets miss)
 *   - android.hardware.camera.front       (front camera; rare omission)
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const FEATURES = [
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.camera.front',
];

function ensureUsesFeature(manifest, featureName) {
  if (!manifest['uses-feature']) {
    manifest['uses-feature'] = [];
  }

  const existing = manifest['uses-feature'].find(
    (f) => f.$ && f.$['android:name'] === featureName,
  );

  if (existing) {
    existing.$['android:required'] = 'false';
  } else {
    manifest['uses-feature'].push({
      $: {
        'android:name': featureName,
        'android:required': 'false',
      },
    });
  }
}

const withTabletSupport = (config) => {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    for (const feature of FEATURES) {
      ensureUsesFeature(manifest, feature);
    }
    return cfg;
  });
};

module.exports = withTabletSupport;
