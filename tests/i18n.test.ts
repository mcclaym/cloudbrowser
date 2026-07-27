import { describe, expect, it } from "vitest";

import {
  DEFAULT_LANGUAGE,
  dictionaries,
  LANGUAGES,
  nextLanguage,
  optionLabel,
  setLanguage,
  t,
} from "../public/js/i18n.js";

/** The console dictionaries are plain JS objects; index them as string maps. */
const tables = dictionaries as Record<string, Record<string, string>>;
const languages = LANGUAGES as string[];

describe("console dictionaries", () => {
  it("ships every advertised language", () => {
    expect(Object.keys(tables).sort()).toEqual([...languages].sort());
  });

  it("keeps both languages in sync", () => {
    const [reference, ...others] = languages;
    const expected = Object.keys(tables[reference]).sort();
    for (const language of others) {
      expect(Object.keys(tables[language]).sort()).toEqual(expected);
    }
  });

  it("has no empty strings", () => {
    for (const language of languages) {
      for (const [key, value] of Object.entries(tables[language])) {
        expect(`${key}:${String(value).trim()}`).not.toBe(`${key}:`);
      }
    }
  });

  it("uses the same placeholders in every language", () => {
    const placeholders = (value: string) =>
      (value.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const key of Object.keys(tables[DEFAULT_LANGUAGE])) {
      const expected = placeholders(tables[DEFAULT_LANGUAGE][key]);
      for (const language of languages) {
        expect(`${key}:${placeholders(tables[language][key])}`).toBe(
          `${key}:${expected}`,
        );
      }
    }
  });
});

describe("t", () => {
  it("interpolates named variables", () => {
    setLanguage("en");
    expect(t("session.remaining", { time: "04:20" })).toBe("04:20 left");
    setLanguage("zh-CN");
    expect(t("session.remaining", { time: "04:20" })).toBe("剩余 04:20");
  });

  it("returns the key when nothing matches", () => {
    expect(t("does.not.exist")).toBe("does.not.exist");
  });

  it("falls back to the default language for unknown languages", () => {
    expect(setLanguage("fr")).toBe(DEFAULT_LANGUAGE);
  });
});

describe("optionLabel", () => {
  it("picks the localized label", () => {
    const option = { value: "JP", label: "Japan", labelZh: "日本" };
    setLanguage("zh-CN");
    expect(optionLabel(option)).toBe("日本");
    setLanguage("en");
    expect(optionLabel(option)).toBe("Japan");
    expect(optionLabel(null)).toBe("");
  });
});

describe("nextLanguage", () => {
  it("cycles through the available languages", () => {
    expect(nextLanguage("zh-CN")).toBe("en");
    expect(nextLanguage("en")).toBe("zh-CN");
  });
});
