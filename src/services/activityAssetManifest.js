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
    // 先前快取過 404 時，force-cache 會持續回傳那個失敗結果，讓所有活動圖片都變成 placeholder。
    // no-cache 會沿用有效快取，但每次會先向伺服器確認 manifest 是否已更新。
    manifestPromise = fetch(withAppBase(MANIFEST_PATH), { cache: 'no-cache' })
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
