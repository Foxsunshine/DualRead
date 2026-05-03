// CSV export for the vocab list.
//
// Target consumers: Anki (which happily takes CSV) and spreadsheet apps. The
// column order is stable so users can build Anki card templates against it.

import type { VocabWord } from "../shared/types";

// RFC 4180 escaping: wrap in quotes if the value contains a comma, quote, CR,
// or LF; double any embedded quotes.
function esc(v: string | number | undefined): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(words: VocabWord[]): string {
  const header = [
    "word",
    "translation",
    "context",
    "source_url",
    "created_at",
    "source_lang",
    "target_lang",
  ];
  const rows = words.map((w) =>
    [
      esc(w.word),
      esc(w.translation),
      esc(w.ctx),
      esc(w.source_url),
      esc(new Date(w.created_at).toISOString()),
      esc(w.source_lang),
      esc(w.target_lang),
    ].join(",")
  );
  // CRLF line terminator per RFC 4180. Excel is the pickiest consumer here.
  return [header.join(","), ...rows].join("\r\n");
}

export async function exportVocabCsv(words: VocabWord[]): Promise<void> {
  const csv = toCsv(words);
  // BOM prefix so Excel auto-detects UTF-8 and renders Chinese translations
  // correctly; without it, Excel on Windows falls back to the system codepage
  // and mojibakes the translation column.
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    await chrome.downloads.download({
      url,
      filename: `dualread-vocab-${stamp}.csv`,
      saveAs: true,
    });
  } finally {
    // chrome.downloads copies the blob internally, so the URL can be revoked
    // shortly after. 60s is generous padding for slow disks / prompts.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
