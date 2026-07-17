const MANIFEST_PATH = 'images/activities/manifest.json';

let manifestPromise = null;
let activityAssetManifest = { assets: {} };

function withAppBase(path) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const cleanPath = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^public\//, '');
  return `${base}/${cleanPath}`.replace(/^\/\//, '/');
}

export async function loadActivityAssetManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(withAppBase(MANIFEST_PATH), { cache: 'force-cache' })
      .then((response) => response.ok ? response.json() : { assets: {} })
      .then((manifest) => {
        activityAssetManifest = manifest?.assets ? manifest : { assets: {} };
        return activityAssetManifest;
      })
      .catch(() => {
        activityAssetManifest = { assets: {} };
        return activityAssetManifest;
      });
  }
  return manifestPromise;
}

export function getLocalActivityImageUrl(activityCode) {
  const entry = activityAssetManifest.assets?.[activityCode];
  const assetPath = entry?.publicPath || '';
  return assetPath ? withAppBase(assetPath) : '';
}
