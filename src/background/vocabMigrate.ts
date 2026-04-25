// Vocab schema migration to v2 (v2.3 schema extension).
//
// Why this exists:
//   The v1/v2.x VocabWord stored translations in the `zh` field (always
//   Chinese, since the only translate target was zh-CN). v2.3 generalises
//   to arbitrary `source_lang` → `target_lang` pairs and stores the
//   payload in a generic `translation` field. Existing rows in
//   chrome.storage.sync need a one-shot back-fill so the new read paths
//   find their data — but the back-fill needs to be:
//     - idempotent (multi-agent P0-1: multi-device race),
//     - per-item size-bounded (P0-2: 8 KB chrome.storage.sync ceiling),
//     - tolerant of empty `zh` (P0-5: don't poison new fields with ""),
//     - service-worker-eviction-safe (P0-3: caller must `await` us).
//
// We DO NOT delete the legacy `zh` / `en` fields here. Read paths fall
// back to them indefinitely; v3 backend will eventually drop them once
// every known user has run this migration.

import {
  STORAGE_KEY_VOCAB_SCHEMA_VERSION,
  VOCAB_SCHEMA_VERSION,
} from "../shared/types";
import type { VocabWord } from "../shared/types";
import { STORAGE_PREFIX_VOCAB } from "../shared/messages";

// Per-item ceiling for chrome.storage.sync is 8192 bytes. We leave 392
// bytes of headroom for Chrome's internal serialization overhead so a
// row near the limit doesn't silently fail the batch `set` and lose
// every other item in the same call.
const PER_ITEM_BYTE_LIMIT = 7800;

function byteSize(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size;
}

export async function migrateVocabSchemaIfNeeded(): Promise<void> {
  // The version flag lives in storage.sync rather than storage.local so
  // every device the user is signed into sees the same flag — without
  // this, three devices each running v2.3 onInstalled would each fire
  // their own migration over the shared sync store, racing and burning
  // 3× the write quota for the same back-fill.
  const versionRecord = await chrome.storage.sync.get(
    STORAGE_KEY_VOCAB_SCHEMA_VERSION,
  );
  const seen = (versionRecord[STORAGE_KEY_VOCAB_SCHEMA_VERSION] ?? 1) as number;
  if (seen >= VOCAB_SCHEMA_VERSION) return;

  const all = await chrome.storage.sync.get(null);
  const updates: Record<string, VocabWord> = {};
  let skippedOversize = 0;
  let skippedEmpty = 0;

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(STORAGE_PREFIX_VOCAB)) continue;
    const v = value as VocabWord;

    // Already migrated — happens when this device runs after another
    // device of the same user already wrote v2 rows. Per-item check
    // makes the migration safe to re-run partial.
    if (v.source_lang && v.target_lang && v.translation) continue;

    // P0-5: don't promote an empty / whitespace `zh` into the new
    // `translation` field. Leaving the row untouched keeps the legacy
    // fallback path intact and avoids "" poisoning the canonical key.
    const legacyTranslation = v.zh?.trim();
    if (!legacyTranslation) {
      skippedEmpty++;
      continue;
    }

    const candidate: VocabWord = {
      ...v,
      source_lang: "en",
      target_lang: "zh-CN",
      translation: legacyTranslation,
    };

    // P0-2: 8 KB per-item cap. Pre-check before adding to the batch so
    // one oversized row doesn't fail the entire `chrome.storage.sync.set`
    // call and reject every other migration.
    if (byteSize(candidate) > PER_ITEM_BYTE_LIMIT) {
      skippedOversize++;
      continue;
    }

    updates[key] = candidate;
  }

  if (skippedOversize > 0 || skippedEmpty > 0) {
    console.warn(
      `[vocabMigrate] skipped ${skippedOversize} oversize, ${skippedEmpty} empty rows`,
    );
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.sync.set(updates);
  }

  // Always advance the version even if no rows needed migration — a fresh
  // install with no vocab still hits this branch and we want subsequent
  // launches to skip the scan.
  await chrome.storage.sync.set({
    [STORAGE_KEY_VOCAB_SCHEMA_VERSION]: VOCAB_SCHEMA_VERSION,
  });
}
