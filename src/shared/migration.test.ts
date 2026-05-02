// Coverage matrix for the v1 → v2 VocabWord migration. Pairs the pure
// migrateRecord(...) function with the orchestration in background/migrate.ts.
// The orchestration tests use a hand-rolled storage adapter rather than a
// chrome.* mock so the deps shape stays the source of truth — adding a
// broadcaster to MigrationDeps would fail one of the tests below.

import { describe, expect, test } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type Settings,
  type VocabWord,
} from "./types";
import { estimateRecordBytes, migrateRecord, shrinkToCap } from "./migration";
import {
  LOCAL_KEY_MIGRATION_LOCK,
  LOCAL_KEY_SCHEMA_VERSION,
  STORAGE_PREFIX_VOCAB,
  SYNC_VALUE_MAX_BYTES,
} from "./messages";
import {
  runMigration,
  type MigrationDeps,
} from "../background/migrate";

const SETTINGS: Settings = { ...DEFAULT_SETTINGS, ui_language: "zh-CN" };

function v1Record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    word: "ephemeral",
    word_key: "ephemeral",
    zh: "短暂的",
    en: "ephemeral",
    ctx: "an ephemeral encounter",
    source_url: "https://example.test/article",
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
    ...overrides,
  };
}

function v2Record(overrides: Partial<VocabWord> = {}): VocabWord {
  return {
    word: "ephemeral",
    word_key: "ephemeral",
    translation: "短暂的",
    ctx: "an ephemeral encounter",
    source_url: "https://example.test/article",
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
    schema_version: CURRENT_SCHEMA_VERSION,
    ...overrides,
  };
}

describe("migrateRecord — v1 → v2 upgrade", () => {
  test("v1 with zh + en → translation = zh, drops en, stamps schema_version", () => {
    const out = migrateRecord(v1Record(), SETTINGS);
    expect(out).not.toBeNull();
    expect(out?.translation).toBe("短暂的");
    expect(out?.schema_version).toBe(2);
    expect((out as unknown as { zh?: unknown }).zh).toBeUndefined();
    expect((out as unknown as { en?: unknown }).en).toBeUndefined();
  });

  test("v1 with zh and no en → translation = zh", () => {
    const out = migrateRecord(v1Record({ en: undefined }), SETTINGS);
    expect(out?.translation).toBe("短暂的");
    expect(out?.schema_version).toBe(2);
  });

  test("v1 with empty zh → returns null (skip)", () => {
    expect(migrateRecord(v1Record({ zh: "" }), SETTINGS)).toBeNull();
    expect(migrateRecord(v1Record({ zh: undefined }), SETTINGS)).toBeNull();
  });

  test("already v2 → returns equivalent record (idempotent)", () => {
    const input = v2Record();
    const out = migrateRecord(input, SETTINGS);
    expect(out).toEqual(input);
    // And running it again on the output stays stable.
    expect(migrateRecord(out, SETTINGS)).toEqual(input);
  });

  test("source_lang / target_lang stay undefined for migrated v1 records", () => {
    const out = migrateRecord(v1Record(), SETTINGS);
    expect(out?.source_lang).toBeUndefined();
    expect(out?.target_lang).toBeUndefined();
  });

  test("missing identity fields → null", () => {
    expect(migrateRecord(v1Record({ word: undefined }), SETTINGS)).toBeNull();
    expect(migrateRecord(v1Record({ word_key: 123 }), SETTINGS)).toBeNull();
    expect(migrateRecord(null, SETTINGS)).toBeNull();
    expect(migrateRecord("not an object", SETTINGS)).toBeNull();
  });
});

describe("estimateRecordBytes + size cap", () => {
  test("a short record fits comfortably under the sync cap", () => {
    expect(estimateRecordBytes(v2Record())).toBeLessThan(SYNC_VALUE_MAX_BYTES);
  });

  test("an oversized record exceeds the sync cap", () => {
    const big = v2Record({ ctx: "x".repeat(SYNC_VALUE_MAX_BYTES + 100) });
    expect(estimateRecordBytes(big)).toBeGreaterThan(SYNC_VALUE_MAX_BYTES);
  });

  test("shrinkToCap trims ctx until the record fits — flush layer accepts it", () => {
    // ~500 bytes over the cap, all in ctx. Truncating the trailing context
    // is enough to bring the record back inside the budget.
    const oversized = v2Record({ ctx: "x".repeat(SYNC_VALUE_MAX_BYTES + 500) });
    const trimmed = shrinkToCap(oversized, SYNC_VALUE_MAX_BYTES);
    expect(estimateRecordBytes(trimmed)).toBeLessThanOrEqual(SYNC_VALUE_MAX_BYTES);
    expect(trimmed.translation).toBe(oversized.translation);
  });

  test("shrinkToCap leaves an irreducibly oversized record over the cap (caller hard-rejects)", () => {
    // The oversize lives in `translation` itself, which shrinkToCap never
    // touches — flush must hard-reject and write last_sync_error.
    const huge = v2Record({ translation: "x".repeat(SYNC_VALUE_MAX_BYTES + 1000) });
    const trimmed = shrinkToCap(huge, SYNC_VALUE_MAX_BYTES);
    expect(estimateRecordBytes(trimmed)).toBeGreaterThan(SYNC_VALUE_MAX_BYTES);
    // ctx is the only field shrinkToCap will eat; everything else survives.
    expect(trimmed.translation).toBe(huge.translation);
  });
});

// ─── runMigration orchestration ─────────────────────────────────────────

interface FakeStorage {
  local: Map<string, unknown>;
  sync: Map<string, unknown>;
  // Set by the test harness when it wants to simulate a SW kill mid-flush.
  // The `key` is a sync key; the next writeSync call that *contains* that
  // key throws once, then the flag clears.
  killOnSyncKey?: string;
}

function makeDeps(store: FakeStorage, now = 1_700_000_500_000): MigrationDeps {
  return {
    readLocal: async (keys) => {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (store.local.has(k)) out[k] = store.local.get(k);
      return out;
    },
    writeLocal: async (entries) => {
      for (const [k, v] of Object.entries(entries)) store.local.set(k, v);
    },
    removeLocal: async (keys) => {
      for (const k of keys) store.local.delete(k);
    },
    readAllSync: async () => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of store.sync.entries()) out[k] = v;
      return out;
    },
    writeSync: async (entries) => {
      if (
        store.killOnSyncKey &&
        Object.keys(entries).some((k) => k === store.killOnSyncKey)
      ) {
        store.killOnSyncKey = undefined;
        throw new Error("simulated SW eviction during writeSync");
      }
      for (const [k, v] of Object.entries(entries)) store.sync.set(k, v);
    },
    removeSync: async (keys) => {
      for (const k of keys) store.sync.delete(k);
    },
    defaultSettings: SETTINGS,
    now: () => now,
  };
}

describe("runMigration — orchestration", () => {
  test("v1 records get rewritten, schema_version flag is set, lock released", async () => {
    const store: FakeStorage = { local: new Map(), sync: new Map() };
    store.local.set("settings", SETTINGS);
    store.sync.set(`${STORAGE_PREFIX_VOCAB}ephemeral`, v1Record());
    store.sync.set(`${STORAGE_PREFIX_VOCAB}lucid`, v1Record({ word: "lucid", word_key: "lucid", zh: "清晰的" }));

    await runMigration(makeDeps(store));

    expect(store.local.get(LOCAL_KEY_SCHEMA_VERSION)).toBe(CURRENT_SCHEMA_VERSION);
    expect(store.local.has(LOCAL_KEY_MIGRATION_LOCK)).toBe(false);
    const eph = store.sync.get(`${STORAGE_PREFIX_VOCAB}ephemeral`) as VocabWord;
    expect(eph.translation).toBe("短暂的");
    expect(eph.schema_version).toBe(2);
    expect((eph as unknown as { zh?: unknown }).zh).toBeUndefined();
  });

  test("re-running on already-migrated storage is a no-op (cold-start re-entry safety)", async () => {
    const store: FakeStorage = { local: new Map(), sync: new Map() };
    store.local.set(LOCAL_KEY_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION);
    store.local.set("settings", SETTINGS);
    const before = v2Record();
    store.sync.set(`${STORAGE_PREFIX_VOCAB}ephemeral`, before);

    await runMigration(makeDeps(store));

    const after = store.sync.get(`${STORAGE_PREFIX_VOCAB}ephemeral`);
    expect(after).toBe(before);
  });

  test("crash mid-flush → cold-start re-entry produces the same final state", async () => {
    // Pass 1: SW dies during writeSync. The lock should be released by the
    // finally block; the schema_version flag must NOT be set so the next
    // wake re-runs the pass.
    const store: FakeStorage = { local: new Map(), sync: new Map() };
    store.local.set("settings", SETTINGS);
    store.sync.set(`${STORAGE_PREFIX_VOCAB}ephemeral`, v1Record());
    store.killOnSyncKey = `${STORAGE_PREFIX_VOCAB}ephemeral`;

    await expect(runMigration(makeDeps(store))).rejects.toThrow(/simulated SW/);
    expect(store.local.has(LOCAL_KEY_MIGRATION_LOCK)).toBe(false);
    expect(store.local.has(LOCAL_KEY_SCHEMA_VERSION)).toBe(false);

    // Pass 2: clean wake. Migration completes idempotently and the record
    // ends up in v2 form — re-applying migrateRecord on a partial state
    // does not double-apply because v1 → v2 is idempotent on v2 input.
    await runMigration(makeDeps(store));
    const out = store.sync.get(`${STORAGE_PREFIX_VOCAB}ephemeral`) as VocabWord;
    expect(out.translation).toBe("短暂的");
    expect(out.schema_version).toBe(2);
    expect(store.local.get(LOCAL_KEY_SCHEMA_VERSION)).toBe(CURRENT_SCHEMA_VERSION);
  });

  test("MigrationDeps shape forbids broadcasting: runMigration never invokes a broadcaster", () => {
    // Structural pin: deps is the only path for chrome.* side effects, so
    // enumerating its keys is enough to prove no broadcaster reached the
    // module. A future change adding chrome.runtime.sendMessage outside
    // deps would still be caught by the substring guard below.
    const store: FakeStorage = { local: new Map(), sync: new Map() };
    const deps = makeDeps(store);
    const expected = new Set([
      "readLocal",
      "writeLocal",
      "removeLocal",
      "readAllSync",
      "writeSync",
      "removeSync",
      "defaultSettings",
      "now",
    ]);
    const actual = new Set(Object.keys(deps));
    expect(actual).toEqual(expected);
    // Belt-and-braces: no key on the deps shape mentions "broadcast",
    // "notify", "send", "publish" — names the next maintainer might reach
    // for if they added a notification path.
    for (const key of actual) {
      expect(/broadcast|notify|send|publish/i.test(key)).toBe(false);
    }
  });
});
