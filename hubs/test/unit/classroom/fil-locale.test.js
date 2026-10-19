import test from "ava";
import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "@formatjs/icu-messageformat-parser";
import { AVAILABLE_LOCALES, FALLBACK_LOCALES } from "../../../src/assets/locales/locale_config";

const fil = JSON.parse(readFileSync(join(__dirname, "../../../src/assets/locales/fil.json"), "utf8"));

test("Filipino is registered, with Tagalog falling back to it", t => {
  t.is(AVAILABLE_LOCALES.fil, "Filipino");
  t.is(FALLBACK_LOCALES.tl, "fil");
});

test("every Filipino message is valid ICU MessageFormat", t => {
  const broken = Object.entries(fil).filter(([, msg]) => {
    try {
      parse(msg);
      return false;
    } catch {
      return true;
    }
  });
  t.deepEqual(
    broken.map(([k]) => k),
    []
  );
});

test("no empty translations", t => {
  t.deepEqual(
    Object.keys(fil).filter(k => !fil[k].trim()),
    []
  );
});
