// Deck storage abstraction with two interchangeable backends:
//   - localStore: this browser only (localStorage). Used when Supabase isn't configured
//     or the user isn't signed in. Export/Import moves decks between devices manually.
//   - supabaseStore: cloud-synced per account, so the same decks appear on every device.
//
// A deck is { id, name, format, decklist_text, updated_at }. A local deck may
// also carry `copiedTo` (see copyLocalDecks), which a local save keeps.

import { supabase } from "./supabase";

const LOCAL_KEY = "mtgweb:decks";

function uid() {
  return (crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const decks = raw ? JSON.parse(raw) : [];
    return decks.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  } catch {
    return [];
  }
}

const localStore = {
  async list() {
    return readLocal();
  },
  async save(deck) {
    const decks = await this.list();
    const now = new Date().toISOString();
    const id = deck.id || uid();
    const idx = decks.findIndex((d) => d.id === id);
    // Callers save { id, name, format, decklist_text }; the copy marks are the
    // store's, so an edit does not make a copied deck look uncopied.
    const next = { copiedTo: decks[idx]?.copiedTo, ...deck, id, updated_at: now };
    if (idx >= 0) decks[idx] = next;
    else decks.push(next);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(decks));
    return next;
  },
  async remove(id) {
    const decks = (await this.list()).filter((d) => d.id !== id);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(decks));
  },
};

function supabaseStore(userId) {
  return {
    async list() {
      const { data, error } = await supabase
        .from("decks")
        .select("id,name,format,decklist_text,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
    async save(deck) {
      const row = {
        ...(deck.id ? { id: deck.id } : {}),
        user_id: userId,
        name: deck.name,
        format: deck.format,
        decklist_text: deck.decklist_text,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("decks")
        .upsert(row)
        .select("id,name,format,decklist_text,updated_at")
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    async remove(id) {
      const { error } = await supabase.from("decks").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

// Pick the active backend. Cloud when signed in; local otherwise.
export function makeStore(userId) {
  return userId && supabase ? supabaseStore(userId) : localStore;
}

// Signing in shows the account's decks, so decks made in this browser while
// signed out drop out of sight. These two copy them over. A copied deck is
// marked with the account it went to (`copiedTo`) instead of reusing its id
// in the cloud: an id another account already copied, or one that is not a
// UUID, would be refused. The browser's own copies are left as they were.
export function localDecksToCopy(userId) {
  return userId ? readLocal().filter((d) => !(d.copiedTo || []).includes(userId)) : [];
}

// `stillSignedIn` is asked before each deck: a copy started by one account
// stops when that account signs out or another signs in.
export async function copyLocalDecks(userId, stillSignedIn = () => true) {
  const cloud = supabaseStore(userId);
  let copied = 0, failed = 0;
  for (const deck of localDecksToCopy(userId)) {
    if (!stillSignedIn()) break;
    try {
      await cloud.save({ name: deck.name, format: deck.format, decklist_text: deck.decklist_text });
    } catch {
      failed++;
      continue;
    }
    copied++;
    // ponytail: a mark that cannot be written (storage full) leaves the deck
    // offered again, and a second press copies it twice.
    try {
      const all = readLocal().map((d) => (d.id === deck.id ? { ...d, copiedTo: [...(d.copiedTo || []), userId] } : d));
      localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
    } catch { /* see above */ }
  }
  return { copied, failed };
}

export { uid };
