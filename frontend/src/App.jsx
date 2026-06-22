import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseEnabled } from "./lib/supabase";
import { api, assembleDecklist, disassembleDecklist, setAccessToken } from "./lib/api";
import { makeStore } from "./lib/store";
import Analyze from "./components/Analyze";
import Build from "./components/Build";
import MyDecks from "./components/MyDecks";
import Rules from "./components/Rules";
import CardSearch from "./components/CardSearch";
import Settings from "./components/Settings";
import Feedback from "./components/Feedback";

const TABS = [
  ["analyze", "Analyze"],
  ["build", "Build"],
  ["decks", "My Decks"],
  ["rules", "Rules"],
  ["cards", "Cards"],
  ["settings", "Settings"],
];

export default function App() {
  const [tab, setTab] = useState("analyze");
  const [session, setSession] = useState(null);
  const [decks, setDecks] = useState([]);
  const [toast, setToast] = useState("");
  const [serverStatus, setServerStatus] = useState("checking"); // checking | ready | waking
  const [serverAi, setServerAi] = useState(false); // ai_available from /api/health
  // Shared deck input so Analyze and Build operate on the same list.
  const [deckText, setDeckText] = useState("");
  const [format, setFormat] = useState("commander");
  const [commander, setCommander] = useState("");

  // AI is usable if the server has a key (ai_available) OR the visitor set a personal key.
  const aiAvailable = serverAi || Boolean(localStorage.getItem("mtgweb:anthropicKey"));

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  // Check if the backend is awake on load, and capture AI availability.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const h = await api.health();
        if (!cancelled) { setServerStatus("ready"); setServerAi(Boolean(h?.ai_available)); }
      } catch {
        if (!cancelled) {
          setServerStatus("waking");
          // Retry after a delay (cold start)
          setTimeout(async () => {
            try {
              const h = await api.health();
              if (!cancelled) { setServerStatus("ready"); setServerAi(Boolean(h?.ai_available)); }
            } catch {
              if (!cancelled) setServerStatus("ready"); // give up gracefully
            }
          }, 10000);
        }
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  // Track Supabase auth session (no-op when Supabase isn't configured).
  useEffect(() => {
    if (!supabaseEnabled) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id || null;
  setAccessToken(session?.access_token || "");
  const cloud = Boolean(userId && supabase);
  const store = makeStore(userId);

  const refresh = useCallback(async () => {
    try {
      setDecks(await store.list());
    } catch (e) {
      notify(`Could not load decks: ${e.message}`);
    }
  }, [store, notify]);

  // Reload decks whenever the active backend changes (sign in/out).
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [userId]);

  const saveDeck = useCallback(async (deck) => {
    await store.save(deck);
    await refresh();
    notify("Saved.");
  }, [store, refresh, notify]);

  const deleteDeck = useCallback(async (id) => {
    await store.remove(id);
    await refresh();
    notify("Deleted.");
  }, [store, refresh, notify]);

  // From Analyze "Save deck": ask for a name, then persist and jump to My Decks.
  const saveFromAnalyze = useCallback(async ({ format: fmt, decklist_text }) => {
    const name = prompt("Name this deck:");
    if (!name) return;
    await saveDeck({ name: name.trim(), format: fmt, decklist_text: assembleDecklist(decklist_text, commander) });
    setTab("decks");
  }, [saveDeck, commander]);

  const _loadDeck = useCallback((deck, targetTab) => {
    const { commander: c, deckText: t } = disassembleDecklist(deck.decklist_text);
    setFormat(deck.format || "commander");
    setCommander(c);
    setDeckText(t);
    setTab(targetTab);
    notify(`Opened "${deck.name}".`);
  }, [notify]);

  const openDeck = useCallback((deck) => _loadDeck(deck, "analyze"), [_loadDeck]);
  const openDeckInBuild = useCallback((deck) => _loadDeck(deck, "build"), [_loadDeck]);

  const addCardToDecklist = useCallback((name) => {
    setDeckText((prev) => `${prev.replace(/\s*$/, "")}\n1 ${name}`);
  }, []);

  return (
    <div className="app">
      {serverStatus === "waking" && (
        <div style={{ background: "var(--accent)", color: "var(--bg)", textAlign: "center", padding: ".4rem", fontSize: ".85rem" }}>
          Server is waking up — first load takes ~30 seconds. Hang tight!
        </div>
      )}
      <header className="app-header">
        <div className="brand"><span className="dot" /> MTG Workshop</div>
        <span className="badge small">{cloud ? session.user.email : supabaseEnabled ? "Not signed in" : "Local mode"}</span>
      </header>

      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      <main>
        {tab === "analyze" && (
          <Analyze
            decklist={deckText}
            setDecklist={setDeckText}
            format={format}
            setFormat={setFormat}
            commander={commander}
            setCommander={setCommander}
            onSaveRequest={saveFromAnalyze}
            notify={notify}
          />
        )}
        {tab === "build" && (
          <Build
            decklist={deckText}
            setDecklist={setDeckText}
            format={format}
            setFormat={setFormat}
            commander={commander}
            setCommander={setCommander}
            aiAvailable={aiAvailable}
            onGoAnalyze={() => setTab("analyze")}
            notify={notify}
          />
        )}
        {tab === "decks" && (
          <MyDecks
            decks={decks}
            signedIn={supabaseEnabled ? Boolean(session) : null}
            cloud={cloud}
            onSave={saveDeck}
            onDelete={deleteDeck}
            onOpen={openDeck}
            onOpenInBuild={openDeckInBuild}
            notify={notify}
            refresh={refresh}
          />
        )}
        {tab === "rules" && <Rules aiAvailable={aiAvailable} notify={notify} />}
        {tab === "cards" && <CardSearch addCard={addCardToDecklist} notify={notify} />}
        {tab === "settings" && <Settings session={session} notify={notify} />}
      </main>

      {toast && <div className="toast">{toast}</div>}
      <Feedback notify={notify} />
    </div>
  );
}
