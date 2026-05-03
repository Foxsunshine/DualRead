// CSV / TSV parser for bulk vocab import.
//
// Round-trips with exportCsv.ts when the input begins with the canonical
// header (`word,translation,context,source_url,created_at,source_lang,
// target_lang`). For any other input — pasted lists, hand-rolled spreadsheet
// dumps — falls back to a 2- or 3-column layout (`word`, `translation`,
// optional `ctx`) with auto-detected separator (TAB if any TAB appears on
// the first non-blank line, else comma).
//
// Pure: no chrome.* / DOM access. Validation rejects empty word/translation
// and any record whose serialized size already exceeds the sync cap, so the
// dialog can surface the bad rows before the background rejects them.

import { estimateRecordBytes } from "../shared/migration";
import { isValidLang } from "../shared/types";
import type { Lang, VocabWord } from "../shared/types";
import { SYNC_VALUE_MAX_BYTES } from "../shared/messages";

export type ImportInvalidReason =
  | "missing_word"
  | "missing_translation"
  | "too_large";

export interface ImportInvalidRow {
  line: number;
  reason: ImportInvalidReason;
}

export interface ImportParseResult {
  rows: VocabWord[];
  invalid: ImportInvalidRow[];
}

const EXPORT_HEADER_PREFIX = "word,translation";
const BOM = "﻿";

// RFC-4180 line splitter that respects quoted CRLFs inside fields. The
// export emits `\r\n` separators with `\r\n` allowed inside quoted ctx
// values; a naive `text.split(/\r?\n/)` would chop those.
function splitLines(raw: string): string[] {
  const lines: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      if (inQuotes && raw[i + 1] === '"') {
        buf += '""';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      buf += ch;
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && raw[i + 1] === "\n") i += 1;
      lines.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.length > 0) lines.push(buf);
  return lines;
}

// Split a single (already line-isolated) record on `sep`, honouring
// RFC-4180 quoting and `""` escapes. Emits raw cell values with surrounding
// quotes/escapes resolved.
function splitFields(line: string, sep: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          buf += '"';
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      buf += ch;
      continue;
    }
    if (ch === '"' && buf.length === 0) {
      inQuotes = true;
      continue;
    }
    if (ch === sep) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out;
}

function parseExportTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

function asLang(value: string | undefined): Lang | undefined {
  if (!value) return undefined;
  return isValidLang(value) ? value : undefined;
}

function wordKeyOf(text: string): string {
  return text.trim().toLowerCase();
}

interface BuildRowInput {
  word: string;
  translation: string;
  ctx?: string;
  source_url?: string;
  source_lang?: Lang;
  target_lang?: Lang;
  created_at?: number;
}

interface ParseOptions {
  uiLanguage: Lang;
}

function buildRow(input: BuildRowInput, opts: ParseOptions): VocabWord {
  const now = Date.now();
  const word = input.word.trim();
  const translation = input.translation.trim();
  return {
    word,
    word_key: wordKeyOf(word),
    translation,
    source_lang: input.source_lang,
    target_lang: input.target_lang ?? opts.uiLanguage,
    ctx: input.ctx && input.ctx.length > 0 ? input.ctx : undefined,
    source_url:
      input.source_url && input.source_url.length > 0
        ? input.source_url
        : undefined,
    created_at: input.created_at ?? now,
    updated_at: now,
    schema_version: 2,
  };
}

function detectSeparator(line: string): "," | "\t" {
  // Prefer TAB whenever one appears outside quotes — pasted spreadsheet
  // selections are TSV by default. Comma is the export format's separator.
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === "\t") return "\t";
  }
  return ",";
}

function isExportHeader(line: string): boolean {
  return line.trim().toLowerCase().startsWith(EXPORT_HEADER_PREFIX);
}

interface PreparedRow {
  line: number;
  cells: string[];
}

function prepareRows(
  raw: string
): { headerCells: string[] | null; rows: PreparedRow[] } {
  const stripped = raw.startsWith(BOM) ? raw.slice(BOM.length) : raw;
  const lines = splitLines(stripped);

  let headerCells: string[] | null = null;
  let separator: "," | "\t" | null = null;
  const rows: PreparedRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    if (lineText.trim().length === 0) continue;

    if (separator === null) {
      // First non-blank line decides the separator and tells us whether
      // we're consuming a header. The header path locks the separator to
      // comma (the export always emits CSV).
      if (isExportHeader(lineText)) {
        separator = ",";
        headerCells = splitFields(lineText, separator).map((c) => c.trim());
        continue;
      }
      separator = detectSeparator(lineText);
    }

    rows.push({
      line: i + 1,
      cells: splitFields(lineText, separator),
    });
  }

  return { headerCells, rows };
}

interface ColumnMap {
  word: number;
  translation: number;
  ctx: number;
  source_url: number;
  created_at: number;
  source_lang: number;
  target_lang: number;
}

function mapColumns(headerCells: string[]): ColumnMap {
  const map: ColumnMap = {
    word: -1,
    translation: -1,
    ctx: -1,
    source_url: -1,
    created_at: -1,
    source_lang: -1,
    target_lang: -1,
  };
  headerCells.forEach((cell, idx) => {
    const key = cell.toLowerCase();
    if (key === "word") map.word = idx;
    else if (key === "translation") map.translation = idx;
    else if (key === "context" || key === "ctx") map.ctx = idx;
    else if (key === "source_url") map.source_url = idx;
    else if (key === "created_at") map.created_at = idx;
    else if (key === "source_lang") map.source_lang = idx;
    else if (key === "target_lang") map.target_lang = idx;
  });
  return map;
}

function pickCell(cells: string[], idx: number): string {
  if (idx < 0 || idx >= cells.length) return "";
  return cells[idx];
}

export function parseImportText(
  raw: string,
  opts: ParseOptions
): ImportParseResult {
  const { headerCells, rows } = prepareRows(raw);
  const columns = headerCells ? mapColumns(headerCells) : null;

  const accepted: VocabWord[] = [];
  const invalid: ImportInvalidRow[] = [];
  // Dedup within the batch itself: a paste with the same word twice should
  // collapse to one entry rather than wasting a slot. Last occurrence wins
  // — matches typical user intent ("the version I typed last").
  const indexByKey = new Map<string, number>();

  for (const { line, cells } of rows) {
    let candidate: BuildRowInput;
    if (columns) {
      const word = pickCell(cells, columns.word);
      const translation = pickCell(cells, columns.translation);
      candidate = {
        word,
        translation,
        ctx: pickCell(cells, columns.ctx),
        source_url: pickCell(cells, columns.source_url),
        source_lang: asLang(pickCell(cells, columns.source_lang)),
        target_lang: asLang(pickCell(cells, columns.target_lang)),
        created_at:
          parseExportTimestamp(pickCell(cells, columns.created_at)) ?? undefined,
      };
    } else {
      // Header-less: column 0 = word, 1 = translation, 2 = optional ctx.
      candidate = {
        word: cells[0] ?? "",
        translation: cells[1] ?? "",
        ctx: cells[2],
      };
    }

    const wordTrim = candidate.word.trim();
    const translationTrim = candidate.translation.trim();
    if (wordTrim.length === 0) {
      invalid.push({ line, reason: "missing_word" });
      continue;
    }
    if (translationTrim.length === 0) {
      invalid.push({ line, reason: "missing_translation" });
      continue;
    }

    const built = buildRow(candidate, opts);
    if (estimateRecordBytes(built) > SYNC_VALUE_MAX_BYTES) {
      invalid.push({ line, reason: "too_large" });
      continue;
    }

    const existingIdx = indexByKey.get(built.word_key);
    if (existingIdx !== undefined) {
      accepted[existingIdx] = built;
    } else {
      indexByKey.set(built.word_key, accepted.length);
      accepted.push(built);
    }
  }

  return { rows: accepted, invalid };
}
