import test from "ava";
import { litePreferencesPatch, isLiteMode, LITE_PREFERENCES } from "../../../src/classroom/lite-mode";

const SCREEN = { width: 2400, height: 1080 };
const DESKTOP = { materialQualitySetting: "high", enableDynamicShadows: true, lazyLoadSceneMedia: false };

test("turning Lite on writes the lite preferences and backs up the old ones", t => {
  const { patch, backup, needsReload } = litePreferencesPatch(true, DESKTOP, null, SCREEN);
  t.deepEqual(patch, { ...LITE_PREFERENCES });
  t.is(backup.materialQualitySetting, "high");
  t.is(backup.maxResolutionWidth, undefined);
  t.true(needsReload, "material quality changed, so a reload is needed");
  t.true(isLiteMode({ ...DESKTOP, ...patch }));
});

test("phones already on low quality don't need a reload", t => {
  const { needsReload } = litePreferencesPatch(true, { materialQualitySetting: "low" }, null, SCREEN);
  t.false(needsReload);
});

test("turning Lite off restores the backup", t => {
  const on = litePreferencesPatch(true, DESKTOP, null, SCREEN);
  const off = litePreferencesPatch(false, { ...DESKTOP, ...on.patch }, on.backup, SCREEN);
  t.is(off.patch.materialQualitySetting, "high");
  t.true(off.patch.enableDynamicShadows);
  t.is(off.patch.maxResolutionWidth, 2400, "no previous cap → full screen resolution");
  t.is(off.backup, null);
  t.true(off.needsReload);
  t.false(isLiteMode({ ...DESKTOP, ...off.patch }));
});

test("turning Lite off without a backup falls back to sensible defaults", t => {
  const off = litePreferencesPatch(false, { ...LITE_PREFERENCES }, null, SCREEN);
  t.is(off.patch.materialQualitySetting, "medium");
  t.is(off.patch.maxResolutionHeight, 1080);
  t.false(off.patch.lazyLoadSceneMedia);
});
