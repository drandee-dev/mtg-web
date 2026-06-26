import DOMPurify from "dompurify";

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ["strong", "em", "b", "i", "p", "br", "ul", "ol", "li", "code", "a", "span"],
  ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
};

export function sanitizeHtml(dirty) {
  return DOMPurify.sanitize(dirty || "", PURIFY_CONFIG);
}
