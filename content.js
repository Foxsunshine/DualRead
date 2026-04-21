// ===== DualRead Content Script (Phase 0 skeleton) =====
// Responsibility: watch text selections, forward to background.
// Tooltip rendering removed; all UI lives in the side panel.
// Highlight engine arrives in Phase 3.

(function () {
  "use strict";

  // Send SELECTION_CHANGED to background on mouseup; debounce duplicates.
  let lastSent = "";
  document.addEventListener("mouseup", () => {
    // Microtask lets the browser finalize the selection range.
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || text.length < 2 || text === lastSent) return;
      lastSent = text;

      chrome.runtime.sendMessage({
        type: "SELECTION_CHANGED",
        text,
        context_sentence: extractContextSentence(sel),
        source_url: location.href
      });
    }, 10);
  });

  // Best-effort: surrounding sentence of the anchor node.
  function extractContextSentence(selection) {
    try {
      const node = selection?.anchorNode;
      const block = node?.nodeType === Node.TEXT_NODE
        ? node.parentElement?.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote, td, figcaption, div")
        : null;
      const text = (block?.innerText || "").replace(/\s+/g, " ").trim();
      if (!text) return "";
      // Trim to a reasonable window of ~400 chars around the selection.
      return text.length > 400 ? text.slice(0, 400) + "…" : text;
    } catch {
      return "";
    }
  }
})();
