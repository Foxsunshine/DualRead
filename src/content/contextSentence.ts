// Walk up from a DOM node to the nearest block-level container, take its
// collapsed innerText, and return at most 400 chars. Used by both the
// selection-relay (mouseup → background) and the click-to-translate
// pipeline so the bubble and the side panel see identical context strings
// for the same word.

const BLOCK_SELECTOR =
  "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, figcaption, div";

const MAX_CONTEXT_CHARS = 400;

export function extractContext(node: Node | null): string {
  try {
    const block =
      node?.nodeType === Node.TEXT_NODE
        ? (node.parentElement?.closest(BLOCK_SELECTOR) as HTMLElement | null)
        : null;
    const text = (block?.innerText || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.length > MAX_CONTEXT_CHARS
      ? text.slice(0, MAX_CONTEXT_CHARS) + "…"
      : text;
  } catch {
    return "";
  }
}
