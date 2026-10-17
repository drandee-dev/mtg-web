import { assembleForStorage } from "./api";
import { b64decode } from "./b64";

/** The deck a share link carries (?deck=<base64>&fmt=&cmd=) as
 * `{ format, decklist_text, commander }`, or null when there is no link or it
 * holds no cards. The deck is saved on arrival and the address becomes
 * /decks/<id> (lib/routes drops the param then). Until that save lands the
 * param stays, so a reload still finds the deck; opening the link again
 * content-dedups onto the saved deck, keeping its goals, session log, and chat
 * history. */
export function loadSharedDeck() {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("deck");
    if (!encoded) return null;
    const decoded = b64decode(encoded);
    const fmt = params.get("fmt") || "commander";
    const cmd = params.get("cmd") || "";
    const decklist_text = assembleForStorage(decoded, cmd, "");
    return decklist_text.trim() ? { format: fmt, decklist_text, commander: cmd } : null;
  } catch { return null; }
}
