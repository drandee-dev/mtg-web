import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, supabaseEnabled } from "./lib/supabase";
import { api, assembleDecklist, assembleForStorage, disassembleDecklist, setAccessToken } from "./lib/api";
import { makeStore } from "./lib/store";
import GlobalToolbar from "./components/layout/GlobalToolbar";
import BottomNav from "./components/layout/BottomNav";
import HamburgerMenu from "./components/layout/HamburgerMenu";
import DeckView from "./components/deck/DeckView";
import MyDecks from "./components/MyDecks";
import Rules from "./components/Rules";
import CardSearch from "./components/CardSearch";
import Settings from "./components/Settings";
import Feedback from "./components/Feedback";
import Playtest from "./components/Playtest";
import Planeswalker from "./components/Planeswalker";

function ColdStartOverlay({ status, onRetry }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const offline = status === "offline";
  return (
    <div className={`cold-start-overlay${offline ? " offline" : ""}`} role="alert" aria-live="polite">
      <div className="cold-start-smoke">
        <span /><span /><span /><span />
      </div>
      <div className="cold-start-icon">⚡</div>
      <div className="cold-start-text">
        {offline ? "Server didn't respond" : "Summoning the server…"}
      </div>
      <div className="cold-start-sub">
        {offline
          ? "The server may be down. Tap below to try again."
          : "Free-tier cold start — usually takes ~30 seconds"}
      </div>
      {!offline && (
        <>
          <div className="cold-start-bar"><div className="cold-start-bar-fill" /></div>
          {elapsed >= 10 && (
            <div className="cold-start-elapsed">{elapsed}s elapsed — still working</div>
          )}
        </>
      )}
      {offline && (
        <button className="cold-start-retry" onClick={onRetry}>Retry connection</button>
      )}
    </div>
  );
}

const TABS = [
  ["decks", "My Decks"],
  ["deck", "Deck"],
  ["rules", "Rules"],
  ["cards", "Cards"],
  ["settings", "Settings"],
];

const VALID_TABS = new Set(TABS.map(([id]) => id));
const TAB_ALIASES = { analyze: "deck", build: "deck" };

function _loadSharedDeck() {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("deck");
    if (!encoded) return null;
    const decoded = atob(encoded);
    const fmt = params.get("fmt") || "commander";
    const cmd = params.get("cmd") || "";
    window.history.replaceState({}, "", window.location.pathname);
    return { deckText: decoded, format: fmt, commander: cmd };
  } catch { return null; }
}

function _initialTab() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("tab");
  if (t && VALID_TABS.has(t)) return t;
  if (t && TAB_ALIASES[t]) return TAB_ALIASES[t];
  return "decks";
}

export default function App() {
  const _shared = _loadSharedDeck();
  const [tab, setTab] = useState(_shared ? "deck" : _initialTab());
  const [menuOpen, setMenuOpen] = useState(false);
  const [playtesting, setPlaytesting] = useState(false);
  const [session, setSession] = useState(null);
  const [decks, setDecks] = useState([]);
  const [toast, setToast] = useState("");
  const [serverStatus, setServerStatus] = useState("checking");
  const [healthRetry, setHealthRetry] = useState(0);
  const [serverAi, setServerAi] = useState(true);
  const [deckText, setDeckText] = useState(_shared?.deckText || "");
  const [format, setFormat] = useState(_shared?.format || "commander");
  const [commander, setCommander] = useState(_shared?.commander || "");
  const [maybeboard, setMaybeboard] = useState("");
  // The currently-open saved deck ({ id, name }), or null for a new unsaved deck.
  const [currentDeck, setCurrentDeck] = useState(null);

  const savedDeckText = useRef(deckText);
  const [startInWizard, setStartInWizard] = useState(false);

  const newDeck = useCallback(() => {
    setDeckText("");
    setCommander("");
    setMaybeboard("");
    setFormat("commander");
    setCurrentDeck(null);
    savedDeckText.current = "";
    setStartInWizard(false);
    setTab("deck");
  }, []);

  const guidedBuild = useCallback(() => {
    setDeckText("");
    setCommander("");
    setMaybeboard("");
    setFormat("commander");
    setCurrentDeck(null);
    savedDeckText.current = "";
    setStartInWizard(true);
    setTab("deck");
  }, []);

  const addToConsidering = useCallback((name) => {
    setMaybeboard((prev) => {
      const has = prev.split("\n").some((l) => l.trim().replace(/^\d+\s+/, "").toLowerCase() === name.toLowerCase());
      if (has) return prev;
      return `${prev.replace(/\s*$/, "")}\n1 ${name}`.trim();
    });
  }, []);

  useEffect(() => {
    const url = new URL(window.location);
    if (tab === "decks") { url.searchParams.delete("tab"); }
    else { url.searchParams.set("tab", tab); }
    window.history.replaceState({}, "", url);
  }, [tab]);

  useEffect(() => {
    function handler(e) {
      if (deckText && deckText !== savedDeckText.current) { e.preventDefault(); }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [deckText]);

  const aiAvailable = serverAi || Boolean(localStorage.getItem("mtgweb:anthropicKey"));

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setServerStatus("checking");
    async function check(attempt) {
      try {
        const h = await api.health();
        if (!cancelled) { setServerStatus("ready"); setServerAi(Boolean(h?.ai_available)); }
      } catch {
        if (cancelled) return;
        if (attempt === 0) setServerStatus("waking");
        if (attempt < 15) {
          setTimeout(() => check(attempt + 1), 10000);
        } else {
          setServerStatus("offline");
        }
      }
    }
    check(0);
    return () => { cancelled = true; };
  }, [healthRetry]);

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
    try { setDecks(await store.list()); }
    catch (e) { notify(`Could not load decks: ${e.message}`); }
  }, [store, notify]);

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [userId]);

  const saveDeck = useCallback(async (deck) => {
    const saved = await store.save(deck);
    await refresh();
    savedDeckText.current = deckText;
    notify("Saved.");
    return saved;
  }, [store, refresh, notify, deckText]);

  const deleteDeck = useCallback(async (id) => {
    await store.remove(id);
    await refresh();
    notify("Deleted.");
  }, [store, refresh, notify]);

  // Save from the deck view: update the open deck in place if there is one,
  // otherwise prompt for a name and create a new deck.
  const saveCurrentDeck = useCallback(async () => {
    const decklist_text = assembleForStorage(deckText, commander, maybeboard);
    if (!assembleDecklist(deckText, commander).trim()) return notify("Nothing to save yet.");
    if (currentDeck?.id) {
      const saved = await saveDeck({ id: currentDeck.id, name: currentDeck.name, format, decklist_text });
      setCurrentDeck({ id: saved.id, name: saved.name });
    } else {
      const name = prompt("Name this deck:");
      if (!name) return;
      const saved = await saveDeck({ name: name.trim(), format, decklist_text });
      setCurrentDeck({ id: saved.id, name: saved.name });
    }
  }, [currentDeck, saveDeck, format, deckText, commander, maybeboard, notify]);

  // Clone: always create a NEW deck (no id), copying the current contents.
  const cloneCurrentDeck = useCallback(async () => {
    const decklist_text = assembleForStorage(deckText, commander, maybeboard);
    if (!assembleDecklist(deckText, commander).trim()) return notify("Nothing to clone yet.");
    const base = currentDeck?.name || "Untitled deck";
    const name = prompt("Name the copy:", `${base} (copy)`);
    if (!name) return;
    const saved = await saveDeck({ name: name.trim(), format, decklist_text });
    setCurrentDeck({ id: saved.id, name: saved.name });
  }, [currentDeck, saveDeck, format, deckText, commander, maybeboard, notify]);

  const exportCurrentDeck = useCallback(async () => {
    const decklist_text = assembleDecklist(deckText, commander);
    if (!decklist_text.trim()) return notify("Nothing to export yet.");
    try {
      const { text } = await api.exportText(decklist_text, format);
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentDeck?.name || "deck"}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify(`Export failed: ${e.message}`);
    }
  }, [deckText, commander, format, currentDeck, notify]);

  const openDeck = useCallback((deck) => {
    const { commander: c, deckText: t, maybeboard: mb } = disassembleDecklist(deck.decklist_text);
    setFormat(deck.format || "commander");
    setCommander(c);
    setDeckText(t);
    setMaybeboard(mb || "");
    setCurrentDeck({ id: deck.id, name: deck.name });
    savedDeckText.current = t;
    setTab("deck");
    notify(`Opened "${deck.name}".`);
  }, [notify]);

  const addCardToDecklist = useCallback((name) => {
    setDeckText((prev) => `${prev.replace(/\s*$/, "")}\n1 ${name}`);
  }, []);

  const shareDeck = useCallback(() => {
    const full = assembleDecklist(deckText, commander);
    if (!full.trim()) return notify("No deck to share.");
    const encoded = btoa(full);
    const params = new URLSearchParams({ deck: encoded, fmt: format });
    if (commander) params.set("cmd", commander);
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
    navigator.clipboard.writeText(url).then(
      () => notify("Share link copied to clipboard!"),
      () => notify("Couldn't copy — check browser permissions."),
    );
  }, [deckText, commander, format, notify]);

  return (
    <div className="app">
      <a href="#main-content" className="sr-only" style={{ position: "absolute", left: "-9999px", top: "auto", width: "1px", height: "1px", overflow: "hidden" }}
        onFocus={(e) => { e.target.style.position = "static"; e.target.style.width = "auto"; e.target.style.height = "auto"; e.target.style.left = "0"; }}
        onBlur={(e) => { e.target.style.position = "absolute"; e.target.style.left = "-9999px"; e.target.style.width = "1px"; e.target.style.height = "1px"; }}>
        Skip to content
      </a>

      {(serverStatus === "waking" || serverStatus === "checking" || serverStatus === "offline") && (
        <ColdStartOverlay status={serverStatus} onRetry={() => setHealthRetry((n) => n + 1)} />
      )}

      <GlobalToolbar
        tabs={TABS}
        tab={tab}
        setTab={setTab}
        cloud={cloud}
        session={session}
        supabaseEnabled={supabaseEnabled}
        onMenuToggle={() => setMenuOpen(true)}
      />

      <HamburgerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        tabs={TABS}
        tab={tab}
        setTab={setTab}
        session={session}
        cloud={cloud}
      />

      <main id="main-content" role="tabpanel">
        {playtesting && (
          <Playtest
            decklist={assembleDecklist(deckText, commander)}
            commander={commander}
            onClose={() => setPlaytesting(false)}
          />
        )}
        {!playtesting && tab === "deck" && (
          <DeckView
            decklist={deckText}
            setDecklist={setDeckText}
            format={format}
            setFormat={setFormat}
            commander={commander}
            setCommander={setCommander}
            maybeboard={maybeboard}
            setMaybeboard={setMaybeboard}
            deckName={currentDeck?.name || null}
            onSave={saveCurrentDeck}
            onClone={cloneCurrentDeck}
            onExport={exportCurrentDeck}
            onPlaytest={() => setPlaytesting(true)}
            onShare={shareDeck}
            startInWizard={startInWizard}
            onWizardConsumed={() => setStartInWizard(false)}
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
            onNewDeck={newDeck}
            onGuidedBuild={guidedBuild}
            notify={notify}
            refresh={refresh}
          />
        )}
        {tab === "rules" && <Rules aiAvailable={aiAvailable} notify={notify} />}
        {tab === "cards" && <CardSearch addCard={addCardToDecklist} notify={notify} />}
        {tab === "settings" && <Settings session={session} notify={notify} />}
      </main>

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      <BottomNav tabs={TABS} tab={tab} setTab={setTab} />
      <Planeswalker
        decklist={deckText}
        commander={commander}
        format={format}
        aiAvailable={aiAvailable}
        serverStatus={serverStatus}
        addCard={addCardToDecklist}
        addToConsidering={addToConsidering}
        notify={notify}
      />
      <Feedback notify={notify} />
    </div>
  );
}
