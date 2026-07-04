import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { supabase, supabaseEnabled } from "./lib/supabase";
import { api, assembleDecklist, assembleForStorage, disassembleDecklist, setAccessToken } from "./lib/api";
import { makeStore } from "./lib/store";
import { downloadFile } from "./lib/hooks";
import { DEFAULT_GOALS, loadGoals, saveGoals } from "./lib/goals";
import GlobalToolbar from "./components/layout/GlobalToolbar";
import BottomNav from "./components/layout/BottomNav";
import ServerStatusBanner from "./components/ServerStatusBanner";
import DeckView from "./components/deck/DeckView";
import MyDecks from "./components/MyDecks";
import Rules from "./components/Rules";
import CardSearch from "./components/CardSearch";
import AccountDropdown from "./components/AccountDropdown";
import Feedback from "./components/Feedback";

const FEEDBACK_ENABLED = Boolean(import.meta.env.VITE_FORMSPREE_ID);
import Playtest from "./components/Playtest";
import Planeswalker from "./components/Planeswalker";

function PasswordResetModal({ onDone, notify }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (pw.length < 6) return notify("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      notify("Password updated!");
      onDone();
    } catch (e) {
      notify(`Update failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-overlay" onClick={(e) => { if (e.target === e.currentTarget) onDone(); }}>
      <div className="account-panel">
        <div className="account-body">
          <div className="account-section-title">Set New Password</div>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="New password (min 6 characters)" className="account-email-input"
            onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
          <button onClick={submit} disabled={busy} className="account-magic-link-btn">
            {busy ? "Updating..." : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  ["decks", "My Decks"],
  ["deck", "Analyze & Build"],
  ["rules", "Rules"],
  ["cards", "Card Search"],
];

const VALID_TABS = new Set(TABS.map(([id]) => id));
const TAB_ALIASES = { analyze: "deck", build: "deck" };

// Unicode-safe base64. Plain btoa/atob throw on non-ASCII bytes, so share links
// for decks with accented card names (e.g. "Jötun Grunt") would otherwise break.
function _b64encode(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}
function _b64decode(b64) {
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

function _loadSharedDeck() {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("deck");
    if (!encoded) return null;
    const decoded = _b64decode(encoded);
    const fmt = params.get("fmt") || "commander";
    const cmd = params.get("cmd") || "";
    // The param stays in the URL on purpose: the deck auto-saves on arrival,
    // and a reload re-parses + content-dedups back onto that same saved deck,
    // so its goals, session log, and chat history survive refreshes.
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
  // Parsed once per page load (lazy init) — the ?deck= param persists in the
  // URL now, so re-decoding on every render would be wasted work.
  const [_shared] = useState(_loadSharedDeck);
  const [tab, setTab] = useState(_shared ? "deck" : _initialTab());
  const [playtesting, setPlaytesting] = useState(false);
  const [session, setSession] = useState(null);
  const [decks, setDecks] = useState([]);
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // DOM nodes of the Planeswalker hub's Optimize and Stats tabs — DeckView
  // portals sections of its DeckSidebar into them (set/cleared by ref callbacks).
  const [pwInsightsEl, setPwInsightsEl] = useState(null);
  const [pwStatsEl, setPwStatsEl] = useState(null);
  // Deck Goals — user-declared AI optimization intent, persisted per deck.
  const [goals, setGoalsState] = useState(DEFAULT_GOALS);
  const [serverStatus, setServerStatus] = useState("checking");
  const [healthRetry, setHealthRetry] = useState(0);
  const [serverAi, setServerAi] = useState(true);
  const [serverWarmed, setServerWarmed] = useState(false);
  const [deckText, setDeckText] = useState(_shared?.deckText || "");
  const [format, setFormat] = useState(_shared?.format || "commander");
  const [commander, setCommander] = useState(_shared?.commander || "");
  const [maybeboard, setMaybeboard] = useState("");
  // The currently-open saved deck ({ id, name }), or null for a new unsaved deck.
  const [currentDeck, setCurrentDeck] = useState(null);

  const savedDeckText = useRef(deckText);
  // Auto-save bookkeeping: a share-link deck saves once on arrival; the busy
  // flag stops the effect re-firing while a save is in flight.
  const sharedAutoSave = useRef(Boolean(_shared));
  const autoSaveBusy = useRef(false);

  // Load the deck's saved goals when the open deck changes; persist on edit.
  useEffect(() => {
    setGoalsState(loadGoals(currentDeck?.id || null)); // eslint-disable-line react-hooks/set-state-in-effect
  }, [currentDeck?.id]);
  const setGoals = useCallback((g) => {
    setGoalsState(g);
    saveGoals(currentDeck?.id || null, g);
  }, [currentDeck?.id]);

  const [startInWizard, setStartInWizard] = useState(false);
  // Pending import-modal tab ("paste" | "url") to open once the new-deck editor
  // mounts, set by avatar-menu shortcuts. null = none.
  const [startImport, setStartImport] = useState(null);
  // Pending action to run when the Decks tab mounts, set by avatar-menu shortcuts:
  // "import" opens the import panel, "search" focuses the deck-search box. null = none.
  const [decksIntent, setDecksIntent] = useState(null);
  const clearDecksIntent = useCallback(() => setDecksIntent(null), []);

  const newDeck = useCallback((importTab = null) => {
    setDeckText("");
    setCommander("");
    setMaybeboard("");
    setFormat("commander");
    setCurrentDeck(null);
    savedDeckText.current = "";
    setStartInWizard(false);
    setStartImport(typeof importTab === "string" ? importTab : null);
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
    setStartImport(null);
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
      if (supabaseEnabled && localStorage.getItem("mtgweb:rememberMe") === "false") {
        supabase.auth.signOut();
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [deckText]);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (r) setInterval(() => r.update(), 60 * 60 * 1000);
    },
  });

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
        if (!cancelled) { setServerStatus("ready"); setServerAi(Boolean(h?.ai_available)); setServerWarmed(Boolean(h?.warmed)); }
      } catch {
        if (cancelled) return;
        if (attempt === 0) setServerStatus("waking");
        // Serverless backend: no cold-start wake to wait out — a failing health
        // check means a real outage, so give up after ~25s instead of 150s.
        if (attempt < 5) {
          setTimeout(() => check(attempt + 1), 5000);
        } else {
          setServerStatus("offline");
        }
      }
    }
    check(0);
    return () => { cancelled = true; };
  }, [healthRetry]);

  const [showPasswordReset, setShowPasswordReset] = useState(false);

  // Whether the initial Supabase session check has resolved. Until it has,
  // `userId` reads as null even for a signed-in user — anything that picks a
  // storage backend (auto-save, above all) must wait for this, or it'll save
  // to local-only storage instead of the account.
  const [authReady, setAuthReady] = useState(!supabaseEnabled);

  useEffect(() => {
    if (!supabaseEnabled) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") {
        setShowPasswordReset(true);
        setSettingsOpen(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // PWA magic-link return: detect auth callback in browser and prompt return to PWA
  const [showPwaReturn, setShowPwaReturn] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_callback") !== "1") return false;
    window.history.replaceState({}, "", window.location.pathname);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    return !isStandalone;
  });

  // Refresh session when tab becomes visible (handles phone sleep/background)
  useEffect(() => {
    if (!supabaseEnabled) return;
    function onVisible() {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession().then(({ data }) => setSession(data.session));
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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

  // Auto-save a brand-new deck the moment it has an identity: opened from a
  // share link, or the first time a commander is chosen. Dedup by content so
  // revisiting the same share link adopts the existing deck instead of
  // creating a duplicate on every visit.
  const autoSaveNewDeck = useCallback(async () => {
    const decklist_text = assembleForStorage(deckText, commander, maybeboard);
    if (!assembleDecklist(deckText, commander).trim()) return;
    const existing = await store.list();
    const dup = existing.find((d) => d.decklist_text === decklist_text);
    if (dup) {
      setCurrentDeck({ id: dup.id, name: dup.name });
      savedDeckText.current = deckText;
      return;
    }
    const name = commander ? commander.replace(" && ", " + ") : "Imported deck";
    const saved = await store.save({ name, format, decklist_text });
    await refresh();
    savedDeckText.current = deckText;
    setCurrentDeck({ id: saved.id, name: saved.name });
    notify(`Saved as "${saved.name}".`);
  }, [deckText, commander, maybeboard, format, store, refresh, notify]);

  useEffect(() => {
    // Wait for the Supabase session check to resolve first — otherwise a
    // signed-in user's deck silently saves to browser-local storage instead
    // of their account (userId reads as null until this settles).
    if (!authReady || currentDeck || tab !== "deck" || autoSaveBusy.current) return;
    if (!sharedAutoSave.current && !commander) return;
    autoSaveBusy.current = true;
    sharedAutoSave.current = false;
    autoSaveNewDeck()
      .catch((e) => notify(`Auto-save failed: ${e.message}`))
      .finally(() => { autoSaveBusy.current = false; });
  }, [authReady, commander, currentDeck, tab, autoSaveNewDeck, notify]);

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
      downloadFile(`${currentDeck?.name || "deck"}.txt`, text);
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
    const encoded = _b64encode(full);
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

      {/* Non-blocking: the app renders immediately; the banner only appears if the
          first health check fails ("waking") or all retries are exhausted ("offline"). */}
      {(serverStatus === "waking" || serverStatus === "offline") && (
        <ServerStatusBanner status={serverStatus} onRetry={() => setHealthRetry((n) => n + 1)} />
      )}

      <GlobalToolbar
        tabs={TABS}
        tab={tab}
        setTab={setTab}
        cloud={cloud}
        session={session}
        supabaseEnabled={supabaseEnabled}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        decks={decks}
        onNewDeck={newDeck}
        onImportUrl={() => newDeck("url")}
        onSearchDecks={() => { setDecksIntent("search"); setTab("decks"); }}
        onOpenDeck={openDeck}
        onPasteDecklist={() => newDeck("paste")}
        onSignOut={() => { supabase.auth.signOut(); notify("Signed out."); }}
        avatarMenuOpen={avatarMenuOpen}
        setAvatarMenuOpen={setAvatarMenuOpen}
        onFeedback={FEEDBACK_ENABLED ? () => setFeedbackOpen(true) : null}
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
            deckId={currentDeck?.id || null}
            onSave={saveCurrentDeck}
            onClone={cloneCurrentDeck}
            onExport={exportCurrentDeck}
            onPlaytest={() => setPlaytesting(true)}
            onShare={shareDeck}
            startInWizard={startInWizard}
            onWizardConsumed={() => setStartInWizard(false)}
            startImport={startImport}
            onImportConsumed={() => setStartImport(null)}
            onBack={() => setTab("decks")}
            notify={notify}
            serverWarmed={serverWarmed}
            pwInsightsEl={pwInsightsEl}
            pwStatsEl={pwStatsEl}
            goals={goals}
            setGoals={setGoals}
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
            onPlaytest={(deck) => { openDeck(deck); setPlaytesting(true); }}
            onNewDeck={newDeck}
            onGuidedBuild={guidedBuild}
            notify={notify}
            refresh={refresh}
            setTab={setTab}
            decksIntent={decksIntent}
            onIntentConsumed={clearDecksIntent}
          />
        )}
        {tab === "rules" && <Rules aiAvailable={aiAvailable} notify={notify} />}
        {tab === "cards" && <CardSearch addCard={addCardToDecklist} notify={notify} />}
      </main>

      {settingsOpen && (
        <AccountDropdown
          session={session}
          supabaseEnabled={supabaseEnabled}
          cloud={cloud}
          deckCount={decks.length}
          onClose={() => setSettingsOpen(false)}
          notify={notify}
        />
      )}

      {needRefresh && (
        <div className="pwa-update-banner" role="alert">
          <span>New version available</span>
          <button onClick={() => updateServiceWorker(true)}>Update</button>
          <button onClick={() => setNeedRefresh(false)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {showPwaReturn && (
        <div className="pwa-return-banner" role="alert">
          <span>Signed in! You can return to the MTG Workshop app now.</span>
          <button onClick={() => setShowPwaReturn(false)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {showPasswordReset && <PasswordResetModal onDone={() => setShowPasswordReset(false)} notify={notify} />}
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
        deckId={currentDeck?.id || null}
        insightsAvailable={tab === "deck" && !playtesting}
        onInsightsSlot={setPwInsightsEl}
        onStatsSlot={setPwStatsEl}
        goals={goals}
      />
      <Feedback open={feedbackOpen} onClose={() => setFeedbackOpen(false)} notify={notify} />
    </div>
  );
}
