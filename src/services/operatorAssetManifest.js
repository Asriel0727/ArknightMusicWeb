import { factionIdToLogoKey, professionToClassSlug } from '../utils/recruitCard.js';

const MANIFEST_PATH = 'images/manifest/operator-assets.json';

let manifestPromise = null;
let operatorAssetManifest = null;

function getBasePath() {
  return import.meta.env.BASE_URL || '/';
}

function withAppBase(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;

  const base = getBasePath().replace(/\/$/, '');
  const cleanPath = String(path)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^public\//, '');

  return `${base}/${cleanPath}`.replace(/^\/\//, '/');
}

function normalizePublicPath(entry) {
  const path = entry?.publicPath || entry?.relativePath || '';
  return withAppBase(path);
}

export async function loadOperatorAssetManifest() {
  if (operatorAssetManifest) return operatorAssetManifest;

  if (!manifestPromise) {
    manifestPromise = fetch(withAppBase(MANIFEST_PATH), { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load operator assets manifest: ${response.status}`);
        }
        return response.json();
      })
      .then((manifest) => {
        operatorAssetManifest = manifest || {};
        return operatorAssetManifest;
      })
      .catch((error) => {
        manifestPromise = null;
        throw error;
      });
  }

  return manifestPromise;
}

export function getOperatorAssetManifest() {
  return operatorAssetManifest;
}

export function getLocalOperatorAvatarUrl(operatorId) {
  if (!operatorId || !operatorAssetManifest) return '';
  const entry = operatorAssetManifest.assets?.avatars?.[operatorId];
  return normalizePublicPath(entry);
}

export function getLocalOperatorPortraitUrl(operatorId, portraitId) {
  if (!operatorId || !portraitId || !operatorAssetManifest) return '';
  const entry = operatorAssetManifest.assets?.portraits?.[`${operatorId}:${portraitId}`];
  return normalizePublicPath(entry);
}

export function getLocalItemIconUrl(iconId) {
  if (!iconId || !operatorAssetManifest) return '';
  return normalizePublicPath(operatorAssetManifest.assets?.items?.[iconId]);
}

export function getLocalSkillIconUrl(iconId) {
  if (!iconId || !operatorAssetManifest) return '';
  return normalizePublicPath(operatorAssetManifest.assets?.skills?.[iconId]);
}

export function getLocalModuleIconUrl(iconId) {
  if (!iconId || !operatorAssetManifest) return '';
  return normalizePublicPath(operatorAssetManifest.assets?.modules?.[iconId]);
}

export function getLocalFactionLogoUrl(factionOrLogoKey) {
  const logoKey = String(factionOrLogoKey || '').startsWith('logo_')
    ? factionOrLogoKey
    : factionIdToLogoKey(factionOrLogoKey);
  const entry = operatorAssetManifest?.assets?.factions?.[logoKey];
  return normalizePublicPath(entry) || withAppBase(`images/factions/${logoKey}.png`);
}

export function getLocalProfessionIconUrl(profession) {
  const entry = operatorAssetManifest?.assets?.classes?.[profession];
  const slug = professionToClassSlug(profession);
  return normalizePublicPath(entry) || withAppBase(`images/classes/class_${slug}.png`);
}

