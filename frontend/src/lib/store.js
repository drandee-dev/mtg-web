// Deck storage abstraction with two interchangeable backends:
//   - localStore: this browser only (localStorage). Used when Supabase isn't configured
//     or the user isn't signed in. Export/Import moves decks between devices manually.
//   - supabaseStore: cloud-synced per account, so the same decks appear on every device.
//
// A deck is { id, name, format, decklist_text, updated_at }.

import { supabase } from "./supabase";

const LOCAL_KEY = "mtgweb:decks";

function uid() {
  return (crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

const localStore = {
  async list() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const decks = raw ? JSON.parse(raw) : [];
      return decks.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    } catch {
      return [];
    }
  },
  async save(deck) {
    const decks = await this.list();
    const now = new Date().toISOString();
    const id = deck.id || uid();
    const next = { ...deck, id, updated_at: now };
    const idx = decks.findIndex((d) => d.id === id);
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

export { uid };
