// Unicode-safe base64. Plain btoa/atob throw on non-ASCII bytes, so share links
// for decks with accented card names (e.g. "Jötun Grunt") would otherwise break.
export function b64encode(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}

export function b64decode(b64) {
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}
