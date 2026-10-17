// Unicode-safe base64. Plain btoa throws on any character past Latin-1 (curly
// quotes, "Ū"), so a share link for a deck with such a card name would break.
export function b64encode(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}

export function b64decode(b64) {
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}
