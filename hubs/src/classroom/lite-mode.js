// Lite mode for budget phones: cap render resolution, lowest material quality, no dynamic shadows,
// and lazy-load scene media (saves mobile data). Uses existing Hubs preferences only.

// Physical pixels. The same cap on both axes, so it works in portrait and landscape.
export const LITE_MAX_RESOLUTION = 1280;
const BACKUP_KEY = "classroom.liteMode.backup";
const LITE_KEYS = [
  "maxResolutionWidth",
  "maxResolutionHeight",
  "materialQualitySetting",
  "enableDynamicShadows",
  "lazyLoadSceneMedia"
];

export const LITE_PREFERENCES = Object.freeze({
  maxResolutionWidth: LITE_MAX_RESOLUTION,
  maxResolutionHeight: LITE_MAX_RESOLUTION,
  materialQualitySetting: "low",
  enableDynamicShadows: false,
  lazyLoadSceneMedia: true
});

export function isLiteMode(prefs) {
  return LITE_KEYS.every(k => prefs[k] === LITE_PREFERENCES[k]);
}

/**
 * Pure: what to write to preferences to switch Lite mode on/off.
 * @param {boolean} on
 * @param {object} current  current preferences
 * @param {object|null} backup  preferences saved when Lite mode was switched on
 * @param {{width:number,height:number}} screen  full screen resolution (physical px), used when there is no backup
 * @returns {{ patch: object, backup: object|null, needsReload: boolean }}
 *   needsReload: material quality only applies to models loaded afterwards, so a reload is needed to see it.
 */
export function litePreferencesPatch(on, current, backup, screen) {
  if (on) {
    const saved = Object.fromEntries(LITE_KEYS.map(k => [k, current[k]]));
    return {
      patch: { ...LITE_PREFERENCES },
      backup: saved,
      needsReload: current.materialQualitySetting !== LITE_PREFERENCES.materialQualitySetting
    };
  }
  const prev = backup || {};
  const patch = {
    maxResolutionWidth: prev.maxResolutionWidth ?? screen.width,
    maxResolutionHeight: prev.maxResolutionHeight ?? screen.height,
    materialQualitySetting: prev.materialQualitySetting ?? "medium",
    enableDynamicShadows: prev.enableDynamicShadows ?? false,
    lazyLoadSceneMedia: prev.lazyLoadSceneMedia ?? false
  };
  return { patch, backup: null, needsReload: patch.materialQualitySetting !== current.materialQualitySetting };
}

function readBackup() {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_KEY));
  } catch {
    return null;
  }
}

function writeBackup(value) {
  try {
    if (value) localStorage.setItem(BACKUP_KEY, JSON.stringify(value));
    else localStorage.removeItem(BACKUP_KEY);
  } catch {
    // Storage unavailable (private mode): Lite mode still works, it just can't restore old settings exactly.
  }
}

/** Applies Lite mode to the Hubs store. Returns true if the page should reload to fully apply it. */
export function setLiteMode(store, on, screen) {
  const { patch, backup, needsReload } = litePreferencesPatch(on, store.state.preferences, readBackup(), screen);
  if (on) writeBackup(backup);
  else writeBackup(null);
  store.update({ preferences: patch });
  return needsReload;
}
