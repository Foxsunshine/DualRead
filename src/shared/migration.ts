// VocabWord schema migration. Single source of truth for "given an unknown
// record from chrome.storage.sync, produce a current-schema VocabWord or drop
// it". Pure so it can be unit-tested without chrome.*, run from the side
// panel's ingress path, and re-applied by the write buffer on records
// enqueued before the SW's init pass finished.
//
// Empty translation returns null (skip): half-formed records left by older
// builds during a failed network save would otherwise be resurrected with a
// fabricated default, silently inventing user data.

import { CURRENT_SCHEMA_VERSION, isValidLang } from "./types";
import type { Lang, Settings, VocabWord } from "./types";

export type MigrationSettings = Pick<Settings, "ui_language">;

interface LegacyVocabRecord {
  word?: unknown;
  word_key?: unknown;
  zh?: unknown;
  en?: unknown;
  ctx?: unknown;
  source_url?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  translation?: unknown;
  source_lang?: unknown;
  target_lang?: unknown;
  schema_version?: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function asLang(v: unknown): Lang | undefined {
  return isValidLang(v) ? v : undefined;
}

export function migrateRecord(
  record: unknown,
  settings: MigrationSettings
): VocabWord | null {
  void settings;
  if (record === null || typeof record !== "object") return null;
  const r = record as LegacyVocabRecord;

  // v2 path: trust schema_version === 2 only when the load-bearing fields are
  // present. A bogus record claiming v2 but missing translation gets dropped
  // rather than silently passed through.
  if (r.schema_version === CURRENT_SCHEMA_VERSION) {
    if (!isString(r.word) || !isString(r.word_key) || !isString(r.translation)) {
      return null;
    }
    if (!r.translation) return null;
    if (!isNumber(r.created_at) || !isNumber(r.updated_at)) return null;
    return {
      word: r.word,
      word_key: r.word_key,
      translation: r.translation,
      source_lang: asLang(r.source_lang),
      target_lang: asLang(r.target_lang),
      ctx: isString(r.ctx) ? r.ctx : undefined,
      source_url: isString(r.source_url) ? r.source_url : undefined,
      created_at: r.created_at,
      updated_at: r.updated_at,
      schema_version: CURRENT_SCHEMA_VERSION,
    };
  }

  // v1 path: zh is the canonical translation, en is the optional reverse.
  // Empty zh = skip. Missing identity fields = skip.
  if (!isString(r.word) || !isString(r.word_key)) return null;
  if (!isString(r.zh) || r.zh.length === 0) return null;
  if (!isNumber(r.created_at) || !isNumber(r.updated_at)) return null;

  // source_lang / target_lang stay undefined for v1 records — there is no
  // reliable way to reconstruct the original direction after the fact, and
  // the CSV contract specifies blank columns for migrated rows.
  return {
    word: r.word,
    word_key: r.word_key,
    translation: r.zh,
    ctx: isString(r.ctx) ? r.ctx : undefined,
    source_url: isString(r.source_url) ? r.source_url : undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
    schema_version: CURRENT_SCHEMA_VERSION,
  };
}

const encoder = new TextEncoder();

export function estimateRecordBytes(word: VocabWord): number {
  return encoder.encode(JSON.stringify(word)).length;
}

// Trim ctx until the record fits, or return the still-oversized record so the
// caller can hard-reject. Binary-search the ctx length so a multi-KB overflow
// converges in ~log2(n) re-encodings instead of stepping 200 bytes at a time.
// Truncation is from the end so the leading sentence anchor — the most useful
// highlight context — survives longest.
export function shrinkToCap(word: VocabWord, limit: number): VocabWord {
  if (estimateRecordBytes(word) <= limit) return word;
  const original = word.ctx ?? "";
  if (original.length === 0) return word;

  // Empty-ctx baseline: if the rest of the record alone exceeds the limit,
  // there's nothing to trim and the caller will hard-reject.
  const baseline: VocabWord = { ...word, ctx: undefined };
  if (estimateRecordBytes(baseline) > limit) return baseline;

  let lo = 0;
  let hi = original.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const candidate: VocabWord = {
      ...word,
      ctx: mid > 0 ? original.slice(0, mid) : undefined,
    };
    if (estimateRecordBytes(candidate) <= limit) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { ...word, ctx: best > 0 ? original.slice(0, best) : undefined };
}
