// Tests for the v2.3 vocab schema migration.
//
// chrome.storage.sync is mocked with a Map. Each test sets up a starting
// shape, calls migrateVocabSchemaIfNeeded, and asserts the resulting
// shape — covering: no-op when version is current, full back-fill on
// fresh v2.3 update, idempotent re-run, multi-device skip-already-done,
// 8 KB per-item guard, empty-zh skip, and version advance even when no
// rows changed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateVocabSchemaIfNeeded } from "./vocabMigrate";
import {
  STORAGE_KEY_VOCAB_SCHEMA_VERSION,
  VOCAB_SCHEMA_VERSION,
} from "../shared/types";
import type { VocabWord } from "../shared/types";

type SyncStore = Record<string, unknown>;

function installMockStorage(initial: SyncStore = {}) {
  let store: SyncStore = { ...initial };
  const sync = {
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (keys == null) return { ...store };
      if (typeof keys === "string") {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      const out: SyncStore = {};
      for (const k of keys) if (k in store) out[k] = store[k];
      return out;
    }),
    set: vi.fn(async (items: SyncStore) => {
      Object.assign(store, items);
    }),
  };
  // Spread a chrome.storage stub onto globalThis. The test only touches
  // chrome.storage.sync; chrome.storage.local is left undefined so a
  // misuse would surface clearly.
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { sync },
  };
  return {
    sync,
    snapshot: () => ({ ...store }),
  };
}

function legacyWord(overrides: Partial<VocabWord> = {}): VocabWord {
  return {
    word: "profound",
    word_key: "profound",
    zh: "深刻的",
    ctx: "a profound observation",
    created_at: 1_000,
    updated_at: 1_000,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe("migrateVocabSchemaIfNeeded", () => {
  it("no-ops when version flag is already at current", async () => {
    const m = installMockStorage({
      [STORAGE_KEY_VOCAB_SCHEMA_VERSION]: VOCAB_SCHEMA_VERSION,
      "v:hello": legacyWord({ word: "hello", word_key: "hello", zh: "你好" }),
    });
    await migrateVocabSchemaIfNeeded();
    // Storage was read once for the version check, but no .set call
    // happened (the un-migrated `v:hello` row is left alone).
    expect(m.sync.set).not.toHaveBeenCalled();
  });

  it("back-fills source_lang / target_lang / translation on a legacy row", async () => {
    const m = installMockStorage({
      "v:hello": legacyWord({ word: "hello", word_key: "hello", zh: "你好" }),
    });
    await migrateVocabSchemaIfNeeded();
    const after = m.snapshot();
    const row = after["v:hello"] as VocabWord;
    expect(row.source_lang).toBe("en");
    expect(row.target_lang).toBe("zh-CN");
    expect(row.translation).toBe("你好");
    expect(row.zh).toBe("你好"); // legacy field preserved
    expect(after[STORAGE_KEY_VOCAB_SCHEMA_VERSION]).toBe(VOCAB_SCHEMA_VERSION);
  });

  it("skips rows that already have the new fields (idempotent)", async () => {
    const alreadyMigrated: VocabWord = {
      word: "x",
      word_key: "x",
      source_lang: "en",
      target_lang: "zh-CN",
      translation: "Y",
      created_at: 1,
      updated_at: 1,
    };
    const m = installMockStorage({
      "v:x": alreadyMigrated,
    });
    await migrateVocabSchemaIfNeeded();
    const after = m.snapshot();
    expect(after["v:x"]).toEqual(alreadyMigrated); // no change to the row itself
    expect(after[STORAGE_KEY_VOCAB_SCHEMA_VERSION]).toBe(VOCAB_SCHEMA_VERSION);
  });

  it("skips rows whose legacy zh is empty / whitespace", async () => {
    const m = installMockStorage({
      "v:empty": legacyWord({ word: "empty", word_key: "empty", zh: "" }),
      "v:ws": legacyWord({ word: "ws", word_key: "ws", zh: "   " }),
    });
    await migrateVocabSchemaIfNeeded();
    const after = m.snapshot();
    const empty = after["v:empty"] as VocabWord;
    const ws = after["v:ws"] as VocabWord;
    expect(empty.translation).toBeUndefined();
    expect(ws.translation).toBeUndefined();
    expect(empty.source_lang).toBeUndefined();
    expect(ws.source_lang).toBeUndefined();
  });

  it("skips rows whose serialized size exceeds the 8 KB per-item cap", async () => {
    // Pad ctx to push the candidate JSON over PER_ITEM_BYTE_LIMIT.
    // PER_ITEM_BYTE_LIMIT = 7800; 8000 ASCII chars in ctx blows past it.
    const big = legacyWord({
      word: "huge",
      word_key: "huge",
      zh: "巨大",
      ctx: "x".repeat(8000),
    });
    const m = installMockStorage({ "v:huge": big });
    await migrateVocabSchemaIfNeeded();
    const after = m.snapshot();
    const row = after["v:huge"] as VocabWord;
    expect(row.translation).toBeUndefined(); // not migrated
    expect(row.zh).toBe("巨大"); // legacy intact
  });

  it("only touches keys with the v: prefix", async () => {
    const m = installMockStorage({
      "v:real": legacyWord({ word: "real", word_key: "real", zh: "真的" }),
      "settings": { ui_language: "fr" },
      "random": "ignored",
    });
    await migrateVocabSchemaIfNeeded();
    const after = m.snapshot();
    expect((after["v:real"] as VocabWord).translation).toBe("真的");
    // non-vocab keys untouched
    expect(after["settings"]).toEqual({ ui_language: "fr" });
    expect(after["random"]).toBe("ignored");
  });

  it("advances the version flag even when no rows changed", async () => {
    const m = installMockStorage({}); // empty store
    await migrateVocabSchemaIfNeeded();
    const after = m.snapshot();
    expect(after[STORAGE_KEY_VOCAB_SCHEMA_VERSION]).toBe(VOCAB_SCHEMA_VERSION);
  });

  it("preserves `note` and other unrelated fields on a migrated row", async () => {
    const m = installMockStorage({
      "v:n": legacyWord({
        word: "n",
        word_key: "n",
        zh: "翻译",
        note: "user note",
        source_url: "https://example.com",
      }),
    });
    await migrateVocabSchemaIfNeeded();
    const row = m.snapshot()["v:n"] as VocabWord;
    expect(row.note).toBe("user note");
    expect(row.source_url).toBe("https://example.com");
    expect(row.translation).toBe("翻译");
  });
});
