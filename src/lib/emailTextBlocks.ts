/**
 * Extract / apply "text blocks" from an HTML email template so a
 * non-technical admin can edit the wording without touching the HTML.
 *
 * Strategy:
 *   - Parse via DOMParser
 *   - Walk the tree and grab any h1/h2/h3/h4/p/li/a element that has
 *     non-empty text content. Don't descend into already-captured
 *     elements (a paragraph is a single block, we don't split the
 *     <strong> inside it into its own block).
 *   - Return a stable ordered list of { key, tag, label, text }.
 *   - applyTextBlocks walks the same way and patches textContent in
 *     the same order. Nested formatting (<strong>, <em>) collapses to
 *     plain text on first edit of that block — acceptable for V1.
 *   - Preserve the original DOCTYPE so the emitted HTML looks identical
 *     to the input when the user didn't change anything.
 */

export interface TextBlock {
  key: string;
  tag: string;
  label: string;
  text: string;
}

const SELECTORS = new Set(["h1", "h2", "h3", "h4", "p", "li", "a"]);

function labelForTag(tag: string, indexByTag: Record<string, number>): string {
  const idx = indexByTag[tag] ?? 0;
  indexByTag[tag] = idx + 1;
  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
      return `Heading (${tag.toUpperCase()})`;
    case "p":
      return `Paragraph ${idx + 1}`;
    case "li":
      return `List item ${idx + 1}`;
    case "a":
      return `Link / button ${idx + 1}`;
    default:
      return tag;
  }
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function extractTextBlocks(html: string | null | undefined): TextBlock[] {
  if (!html || typeof window === "undefined") return [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const blocks: TextBlock[] = [];
    const indexByTag: Record<string, number> = {};
    let globalIndex = 0;

    const walk = (el: Element) => {
      const tag = el.tagName.toLowerCase();
      if (SELECTORS.has(tag)) {
        const text = collapseWhitespace(el.textContent ?? "");
        if (text.length > 0) {
          blocks.push({
            key: `${tag}-${globalIndex++}`,
            tag,
            label: labelForTag(tag, indexByTag),
            text,
          });
          return; // don't descend — this node's text is fully captured
        }
      }
      for (const child of Array.from(el.children)) walk(child);
    };

    if (doc.body) walk(doc.body);
    return blocks;
  } catch {
    return [];
  }
}

export function applyTextBlocks(html: string, blocks: TextBlock[]): string {
  if (!html || typeof window === "undefined") return html;
  try {
    const doctype = html.match(/^<!DOCTYPE[^>]*>/i)?.[0];
    const doc = new DOMParser().parseFromString(html, "text/html");
    let idx = 0;

    const walk = (el: Element) => {
      const tag = el.tagName.toLowerCase();
      if (SELECTORS.has(tag)) {
        const text = collapseWhitespace(el.textContent ?? "");
        if (text.length > 0) {
          const b = blocks[idx++];
          if (b && b.text !== text) {
            // Setting textContent strips inner formatting; acceptable for V1.
            el.textContent = b.text;
          }
          return;
        }
      }
      for (const child of Array.from(el.children)) walk(child);
    };

    if (doc.body) walk(doc.body);
    const serialized = doc.documentElement.outerHTML;
    return (doctype ? doctype + "\n" : "") + serialized;
  } catch {
    return html;
  }
}

/**
 * Extract a flat plain-text version of the HTML body — used to populate
 * the text_body column automatically if the admin hasn't provided one.
 */
export function extractPlainText(html: string | null | undefined): string {
  if (!html || typeof window === "undefined") return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    // Drop style/script tags so their content doesn't leak into the plain text.
    doc.querySelectorAll("style, script, head").forEach((el) => el.remove());
    const text = (doc.body?.textContent ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");
    return text;
  } catch {
    return "";
  }
}
