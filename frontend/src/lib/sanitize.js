import DOMPurify from "dompurify";

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ["strong", "em", "b", "i", "p", "br", "ul", "ol", "li", "code", "a", "span"],
  // No `style`: this HTML is AI output (steerable via prompt injection through
  // card text), and DOMPurify does not sanitize CSS values — inline styles
  // would allow overlay/phishing rendering inside message bubbles.
  ALLOWED_ATTR: ["href", "target", "rel", "class"],
};

export function sanitizeHtml(dirty) {
  return DOMPurify.sanitize(dirty || "", PURIFY_CONFIG);
}
