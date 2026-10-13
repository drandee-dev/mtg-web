import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { supabase, supabaseEnabled } from "./lib/supabase";
import { api, assembleDecklist, assembleForStorage, disassembleDecklist, setAccessToken, warnIfBadAdd } from "./lib/api";
import { commanderDisplay } from "./lib/deckParser";
import { makeStore } from "./lib/store";
import { downloadFile } from "./lib/hooks";
import { historyTopIsGhost, registerTabHandler, useBackClose } from "./lib/backstack";
import { buildPath, parseLocation, resolveDeckRoute } from "./lib/routes";
import { clearDraft, loadDraft, saveDraft } from "./lib/drafts";
import { DEFAULT_GOALS, loadGoals, saveGoals } from "./lib/goals";
import { clearBuildNotes } from "./lib/buildNotes";
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
import Commanders from "./components/Commanders";

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
            {busy ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  ["decks", "My Decks"],
  ["deck", "Analyze & Build"],
  ["commanders", "Commanders"],
  ["rules", "Rules"],
  ["cards", "Card Search"],
];

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
    // The deck auto-saves on arrival and the address becomes /decks/<id>
    // (lib/routes drops the param then). Until that save lands the param stays,
    // so a reload still finds the deck; opening the link again content-dedups
    // onto the saved deck, keeping its goals, session log, and chat history.
    return { deckText: decoded, format: fmt, commander: cmd };
  } catch { return null; }
}

// The open saved deck. `saved` is its copy in storage ({ text, format }), kept
// in the same object as the id so the two can never be out of step: "unsaved"
// compares the editor against it.
function _openDeck(deck, text, format) {
  return { id: deck.id, name: deck.name, saved: { text, format } };
}

export default function App() {
  // Parsed once per page load (lazy init): the address moves on once the deck
  // is saved, and what the link carried is still needed after that.
  const [_shared] = useState(_loadSharedDeck);
  // Where the app is: { tab, slug, deckId }, the shape lib/routes reads from
  // the address (/rules, /commanders/<slug>, /decks/<id>, /new), through the
  // app's one history mechanism, not a second router. A share link always
  // opens its deck.
  const [route, setRoute] = useState(() => (
    _shared ? { tab: "deck", slug: null, deckId: null } : parseLocation(window.location)
  ));
  const { tab } = route;
  // Which commander page is open within the Commanders tab (/commanders/<slug>).
  const commanderSlug = route.slug;
  // The commander the Wizard should pre-seed when "Build with strategy" is clicked.
  const [wizardInitialCommander, setWizardInitialCommander] = useState("");
  const [playtesting, setPlaytesting] = useState(false);
  // Cards to seed into the opening hand when Playtest opens ("goldfish this line").
  const [playtestStage, setPlaytestStage] = useState(null);
  // Per-tab window scroll positions, restored when a tab remounts.
  const tabScroll = useRef({});
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
  // The currently-open saved deck ({ id, name, saved }, see _openDeck), or null
  // for a new unsaved deck.
  const [currentDeck, setCurrentDeck] = useState(null);
  // The editor in storage form. Differing from the saved copy in any part
  // (cards, commander, Considering, format) is what "unsaved" means.
  const storageText = assembleForStorage(deckText, commander, maybeboard);
  const unsaved = Boolean(
    currentDeck?.id && currentDeck.saved
    && (storageText !== currentDeck.saved.text || format !== currentDeck.saved.format),
  );

  // Unsaved edits to a saved deck are kept as a draft as they happen
  // (lib/drafts), so leaving the deck never depends on a "discard?" prompt.
  // draftKept is false only when that write failed; the prompts guard then.
  const draftKept = useRef(true);
  useEffect(() => {
    if (!currentDeck?.id || !currentDeck.saved) return;
    if (unsaved) {
      draftKept.current = saveDraft(currentDeck.id, { format, decklist_text: storageText });
    } else {
      clearDraft(currentDeck.id);
      draftKept.current = true;
    }
  }, [currentDeck?.id, currentDeck?.saved, unsaved, storageText, format]);

  // Fill the editor from a deck's storage form. Returns the card text, and the
  // whole form as the editor will reassemble it (the saved copy to compare to).
  const showInEditor = useCallback((fmt, decklistText) => {
    const { commander: c, deckText: t, maybeboard: mb } = disassembleDecklist(decklistText);
    setFormat(fmt || "commander");
    setCommander(c);
    setDeckText(t);
    setMaybeboard(mb || "");
    return { cards: t, text: assembleForStorage(t, c, mb) };
  }, []);

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

  // In-app unsaved-changes guard: opening/creating another deck overwrites the
  // editor, so unsaved edits get the same protection beforeunload already
  // gives page exits. Refs keep the guard stable (and the callbacks dep-free).
  const deckTextRef = useRef("");
  const openIdRef = useRef(null);
  const userIdRef = useRef(null);
  // A new deck with no id yet has no draft to fall back on. If Back lands on a
  // saved deck while one is in the editor it is held here, and put back when
  // the address returns to /new.
  const heldNewDeck = useRef(null);
  useEffect(() => {
    deckTextRef.current = deckText;
    openIdRef.current = currentDeck?.id || null;
    userIdRef.current = session?.user?.id || null;
  });

  // Every move in the app. A route carries a deck id only on the deck tab, and
  // going to that tab means the deck the editor already holds (/new if none).
  const goTo = useCallback((next) => setRoute((r) => ({ ...r, deckId: null, ...next })), []);
  const setTab = useCallback((t) => {
    goTo(t === "deck" ? { tab: t, deckId: openIdRef.current } : { tab: t });
  }, [goTo]);
  const setCommanderSlug = useCallback((slug) => goTo({ tab: "commanders", slug }), [goTo]);

  const confirmDiscardEdits = useCallback(() => {
    // A saved deck's edits are already kept as its draft: leaving loses nothing.
    if (openIdRef.current && draftKept.current) return true;
    const cur = deckTextRef.current;
    if (cur && cur !== savedDeckText.current) {
      return window.confirm("You have unsaved deck changes. Discard them?");
    }
    return true;
  }, []);

  // The generator's per-card notes describe one deck and are keyed by card
  // name alone, so they have to go the moment a different deck is on screen.
  // emptyEditor and loadDeck are every way that happens; auto-save giving the
  // just-generated deck an id deliberately isn't one of them.
  const emptyEditor = useCallback(() => {
    clearBuildNotes();
    setDeckText("");
    setCommander("");
    setMaybeboard("");
    setFormat("commander");
    setCurrentDeck(null);
    savedDeckText.current = "";
  }, []);

  // Put a saved deck in the editor. Edits left unsaved last time come back on
  // top of the saved copy, and the deck shows as unsaved. Returns whether any did.
  const loadDeck = useCallback((deck) => {
    clearBuildNotes();
    const fmt = deck.format || "commander";
    const shown = showInEditor(fmt, deck.decklist_text);
    setCurrentDeck(_openDeck(deck, shown.text, fmt));
    savedDeckText.current = shown.cards;
    const draft = loadDraft(deck.id);
    if (draft) showInEditor(draft.format || fmt, draft.decklist_text);
    return Boolean(draft);
  }, [showInEditor]);

  // initialCommander pre-seeds the manual builder — "Build from scratch" from a
  // commander page (Job 2).
  const newDeck = useCallback((importTab = null, initialCommander = "") => {
    if (!confirmDiscardEdits()) return;
    emptyEditor();
    setCommander(initialCommander || "");
    setStartInWizard(false);
    setStartImport(typeof importTab === "string" ? importTab : null);
    goTo({ tab: "deck" });
  }, [confirmDiscardEdits, emptyEditor, goTo]);

  // initialCommander pre-seeds the Wizard — "Build with strategy" from a
  // commander page (Job 2).
  const guidedBuild = useCallback((initialCommander = "") => {
    if (!confirmDiscardEdits()) return;
    emptyEditor();
    setStartInWizard(true);
    setWizardInitialCommander(initialCommander || "");
    setStartImport(null);
    goTo({ tab: "deck" });
  }, [confirmDiscardEdits, emptyEditor, goTo]);

  const addToConsidering = useCallback((name) => {
    setMaybeboard((prev) => {
      const has = prev.split("\n").some((l) => l.trim().replace(/^\d+\s+/, "").toLowerCase() === name.toLowerCase());
      if (has) return prev;
      return `${prev.replace(/\s*$/, "")}\n1 ${name}`.trim();
    });
  }, []);

  // Tab ⇄ history integration: user-initiated tab changes PUSH an entry (so
  // back returns to the previous tab instead of exiting the app); back/forward
  // restores the tab from the URL without pushing again.
  useEffect(() => {
    registerTabHandler((layerClosed) => {
      const next = parseLocation(window.location);
      // Back onto /new while the editor holds a saved deck. A deck that got
      // its id under an open modal (a paste, an import) could not take over
      // its /new entry then, because the modal's entry was on top; it does
      // now. Any older /new likewise shows the deck the editor holds instead
      // of emptying it, unless a new deck was set aside for it.
      if (next.tab === "deck" && !next.deckId && openIdRef.current && !heldNewDeck.current) {
        next.deckId = openIdRef.current;
        const { search, hash } = window.location;
        window.history.replaceState(window.history.state, "", buildPath(next, search) + hash);
      }
      // Back closing a layer never moves the app; only the address needed a look.
      if (!layerClosed) setRoute(next);
    });
  }, []);

  const addressSynced = useRef(false);
  const { deckId } = route;
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const slug = tab === "commanders" ? commanderSlug : null;
    const next = buildPath({ tab, slug, deckId }, search) + hash;
    if (!addressSynced.current) {
      // On load the address is only being corrected (an old ?tab= link becomes
      // its path), so it replaces.
      addressSynced.current = true;
      if (next !== pathname + search + hash) window.history.replaceState({ tab }, "", next);
      return;
    }
    // Back/forward already moved the address to where the state now is. Read
    // it rather than flag the pop: a pop that changes nothing (the skip link's
    // #main-content) never reaches this effect to clear a flag.
    const here = parseLocation(window.location);
    if (here.tab === tab && here.slug === slug && here.deckId === deckId) return;
    // A deck taking the place of /new (a new deck just given its id by a first
    // save or a share link's auto-save, or a saved deck opened from the menu)
    // keeps that place in history: /new becomes /decks/<id>, so Back doesn't
    // return to an empty editor.
    const savedFromNew = here.tab === "deck" && !here.deckId && deckId;
    // Recycle an abandoned layer entry rather than stacking on top of it. A
    // layer still open (the deck got its id under a modal) keeps its marker,
    // so its entry is recycled later like any other; the /new entry beneath it
    // is put right when Back reaches it (the pop handler above).
    const top = window.history.state;
    const ghost = historyTopIsGhost();
    if (savedFromNew || ghost) window.history.replaceState(top?.mtgwebLayer && !ghost ? top : { tab }, "", next);
    else window.history.pushState({ tab }, "", next);
  }, [tab, commanderSlug, deckId]);

  // Back gesture closes full-screen/system layers before walking tabs.
  useBackClose(playtesting, () => setPlaytesting(false));
  useBackClose(settingsOpen, () => setSettingsOpen(false));
  useBackClose(feedbackOpen, () => setFeedbackOpen(false));

  // Scroll restoration per tab.
  useEffect(() => {
    const scrolls = tabScroll.current;
    window.scrollTo(0, scrolls[tab] || 0);
    return () => { scrolls[tab] = window.scrollY; };
  }, [tab]);

  useEffect(() => {
    function handler(e) {
      // Only a deck with no draft to fall back on needs the browser's prompt.
      const kept = currentDeck?.id && draftKept.current;
      // So does a new deck set aside by Back: it lives only in memory.
      if ((!kept && deckText && deckText !== savedDeckText.current) || heldNewDeck.current) { e.preventDefault(); }
      if (supabaseEnabled && localStorage.getItem("mtgweb:rememberMe") === "false") {
        supabase.auth.signOut();
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [deckText, currentDeck?.id]);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (r) setInterval(() => r.update(), 60 * 60 * 1000);
    },
  });

  // AI availability comes from the server alone. The old "personal API key"
  // setting was vestigial — the key was stored in localStorage but never sent
  // anywhere, so it was pure secret-exfiltration surface. Purge stored keys.
  useEffect(() => {
    try { localStorage.removeItem("mtgweb:anthropicKey"); } catch { /* storage blocked */ }
  }, []);
  const aiAvailable = serverAi;

  // Toasts optionally carry one action ("Saved. [Share]"). Action toasts stay
  // up longer; a new toast replaces the pending dismiss timer.
  const toastTimer = useRef(null);
  const notify = useCallback((msg, action) => {
    setToast(msg ? { text: msg, action: action || null } : "");
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), action ? 6500 : 3500);
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

  // The open deck belongs to the store it was opened from: this browser's
  // decks, or one account's. When the account changes under it (sign in, sign
  // out, another tab doing either) the editor lets go of it, and its address
  // resolves again against the new list: the deck if it is there, "Deck not
  // found" if not. Kept, a Save would copy it into the other store. Its
  // unsaved edits stay in its draft. A new deck with no id belongs to no
  // store yet, and stays.
  const applySession = useCallback((s) => {
    if ((s?.user?.id || null) !== userIdRef.current && openIdRef.current) emptyEditor();
    setSession(s);
  }, [emptyEditor]);
  // getSession answers "no session" with an error when the token has run out
  // and the refresh could not reach the server. That is a dead connection, not
  // a sign-out (which arrives as its own event), so the session on hand stays.
  const readSession = useCallback(
    () => supabase.auth.getSession().then(({ data, error }) => { if (!error) applySession(data.session); }),
    [applySession],
  );

  useEffect(() => {
    if (!supabaseEnabled) return;
    readSession().then(() => setAuthReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      applySession(s);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") {
        setShowPasswordReset(true);
        setSettingsOpen(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [applySession, readSession]);

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
      if (document.visibilityState === "visible") readSession();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [readSession]);

  const userId = session?.user?.id || null;
  setAccessToken(session?.access_token || "");
  const cloud = Boolean(userId && supabase);
  const store = makeStore(userId);

  // Whose list `decks` is: the user id it was loaded for (null for this
  // browser's own decks), undefined until a list arrives. A deck address can
  // only be "not found" against the right list (resolveDeckRoute).
  const [decksLoadedFor, setDecksLoadedFor] = useState(undefined);
  const refresh = useCallback(async () => {
    try {
      const list = await store.list();
      // A list that lands after the account changed belongs to the other store.
      if (userIdRef.current !== userId) return;
      setDecks(list);
      setDecksLoadedFor(userId);
    } catch (e) { notify(`Could not load decks: ${e.message}`); }
  }, [store, notify, userId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [userId]);

  // The address names the deck and the editor follows it. Opening a deck from
  // the list fills the editor itself (openDeck), so this only has work to do
  // when the address moved first: a cold load, a second browser tab, Back,
  // Forward. DeckView stays unmounted until the two agree.
  const editorId = currentDeck?.id || null;
  const deckReady = tab === "deck" && deckId === editorId;
  const wanted = tab === "deck" && deckId && !deckReady
    ? resolveDeckRoute({ deckId, decks, decksLoadedFor, authReady, userId })
    : null;
  const wantedDeck = wanted?.deck || null;
  // Setting state from this effect is its job: the address is the outside
  // system, and the deck list it resolves against arrives after the first render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (tab !== "deck" || deckReady) return;
    if (!deckId) {
      // /new, with a saved deck still in the editor (its edits are in its
      // draft). The pop handler only lets this through for a held new deck.
      emptyEditor();
      const held = heldNewDeck.current;
      if (held) showInEditor(held.format, held.decklist_text);
      heldNewDeck.current = null;
    } else if (wantedDeck) {
      if (!editorId && storageText.trim()) heldNewDeck.current = { format, decklist_text: storageText };
      loadDeck(wantedDeck);
    }
  }, [tab, deckReady, deckId, wantedDeck, editorId, storageText, format, emptyEditor, showInEditor, loadDeck]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The browser title names the place, and on a deck address the deck.
  const deckMissing = wanted?.status === "missing";
  useEffect(() => {
    const names = { decks: "My Decks", commanders: "Commanders", rules: "Rules", cards: "Card Search" };
    const deckTitle = deckMissing ? "Deck not found" : currentDeck?.name || "Deck Builder";
    document.title = `${tab === "deck" ? deckTitle : names[tab] || "MTG Workshop"} · MTG Workshop`;
  }, [tab, deckMissing, currentDeck?.name]);

  // A save comes back after an await, and the editor may hold another deck by
  // then. Only the deck that was saved takes the saved copy: on any other deck
  // it would turn that deck's whole text into unsaved edits and a draft. A new
  // deck gets its id here, and its address with it. Returns whether it applied.
  const adoptSaved = useCallback((wasId, saved, text, fmt) => {
    if (openIdRef.current !== (wasId || null)) return false;
    setCurrentDeck(_openDeck(saved, text, fmt));
    if (saved.id !== wasId) setRoute((r) => (r.tab === "deck" ? { ...r, deckId: saved.id } : r));
    return true;
  }, []);

  const shareDeck = useCallback(() => {
    const full = assembleDecklist(deckText, commander);
    if (!full.trim()) return notify("No deck to share.");
    const encoded = _b64encode(full);
    const params = new URLSearchParams({ deck: encoded, fmt: format });
    if (commander) params.set("cmd", commander);
    // From "/", not the current path: the Share toast outlives a tab switch.
    const url = `${window.location.origin}/?${params}`;
    navigator.clipboard.writeText(url).then(
      () => notify("Share link copied to clipboard!"),
      () => notify("Couldn't copy — check browser permissions."),
    );
  }, [deckText, commander, format, notify]);

  const saveDeck = useCallback(async (deck) => {
    const saved = await store.save(deck);
    // A save from outside the editor (a rename in the deck list) can be of the
    // deck the editor holds. Its name follows, or the editor's next Save
    // would write the old one back.
    if (saved.id === openIdRef.current) setCurrentDeck((d) => (d?.id === saved.id ? { ...d, name: saved.name } : d));
    await refresh();
    savedDeckText.current = deckText;
    // Share-after-save: the moment a deck is saved is the moment sharing it
    // becomes meaningful — offer it right on the toast.
    notify("Saved.", { label: "🔗 Share link", onClick: shareDeck });
    return saved;
  }, [store, refresh, notify, deckText, shareDeck]);

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
      if (!adoptSaved(null, dup, decklist_text, dup.format || "commander")) return;
      savedDeckText.current = deckText;
      // Opening a share link again lands here: edits made since it was saved
      // are in its draft, and showing the link's own text would wipe them.
      const draft = loadDraft(dup.id);
      if (draft) showInEditor(draft.format || dup.format, draft.decklist_text);
      return;
    }
    const name = commander ? commanderDisplay(commander) : "Imported deck";
    const saved = await store.save({ name, format, decklist_text });
    await refresh();
    if (!adoptSaved(null, saved, decklist_text, format)) return;
    savedDeckText.current = deckText;
    notify(`Saved as "${saved.name}".`, { label: "🔗 Share link", onClick: shareDeck });
  }, [deckText, commander, maybeboard, format, store, refresh, notify, shareDeck, showInEditor, adoptSaved]);

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

  // Delete is destructive — pair it with a toast Undo (guideline: destructive
  // actions need confirmation or undo). Restore re-creates the deck from the
  // snapshot under the same id, so its address opens it again.
  const deleteDeck = useCallback(async (id) => {
    const doomed = decks.find((d) => d.id === id);
    // Unsaved edits go with the deck, and come back with it on Undo.
    const draft = loadDraft(id);
    await store.remove(id);
    clearDraft(id);
    // It leaves the list now, not when the reload below lands: until then its
    // address would still find it there and load it straight back.
    setDecks((list) => list.filter((d) => d.id !== id));
    // If it is the deck in the editor, the editor empties with it: left there,
    // the next edit would write a draft for a deck that no longer exists.
    if (openIdRef.current === id) emptyEditor();
    await refresh();
    notify(
      doomed ? `Deleted "${doomed.name}".` : "Deleted.",
      doomed && {
        label: "Undo",
        onClick: async () => {
          // The draft goes back first: the save reloads the list, and if the
          // address is this deck's it loads at once and reads its draft then.
          if (draft) saveDraft(doomed.id, draft);
          try {
            await saveDeck({ id: doomed.id, name: doomed.name, format: doomed.format, decklist_text: doomed.decklist_text });
            notify(`Restored "${doomed.name}".`);
          } catch {
            if (draft) clearDraft(doomed.id);
            notify("Couldn't restore the deck.");
          }
        },
      },
    );
  }, [store, refresh, notify, decks, saveDeck, emptyEditor]);

  // Save from the deck view: update the open deck in place if there is one,
  // otherwise prompt for a name and create a new deck.
  const saveCurrentDeck = useCallback(async () => {
    const decklist_text = assembleForStorage(deckText, commander, maybeboard);
    if (!assembleDecklist(deckText, commander).trim()) return notify("Nothing to save yet.");
    if (currentDeck?.id) {
      const saved = await saveDeck({ id: currentDeck.id, name: currentDeck.name, format, decklist_text });
      adoptSaved(currentDeck.id, saved, decklist_text, format);
    } else {
      // A rename before first save already supplied a name — don't re-prompt.
      const name = currentDeck?.name || prompt("Name this deck:");
      if (!name) return;
      const saved = await saveDeck({ name: name.trim(), format, decklist_text });
      adoptSaved(null, saved, decklist_text, format);
    }
  }, [currentDeck, saveDeck, format, deckText, commander, maybeboard, notify, adoptSaved]);

  // Rename the open deck. Saved decks persist immediately; unsaved decks just
  // carry the name until their first save.
  const renameCurrentDeck = useCallback(async (name) => {
    const trimmed = (name || "").trim().slice(0, 80);
    if (!trimmed) return;
    if (currentDeck?.id) {
      const decklist_text = assembleForStorage(deckText, commander, maybeboard);
      const saved = await saveDeck({ id: currentDeck.id, name: trimmed, format, decklist_text });
      adoptSaved(currentDeck.id, saved, decklist_text, format);
      notify(`Renamed to "${saved.name}".`);
    } else {
      setCurrentDeck((d) => ({ ...d, id: d?.id || null, name: trimmed }));
    }
  }, [currentDeck, saveDeck, format, deckText, commander, maybeboard, notify, adoptSaved]);

  // Clone: always create a NEW deck (no id), copying the current contents.
  const cloneCurrentDeck = useCallback(async () => {
    const decklist_text = assembleForStorage(deckText, commander, maybeboard);
    if (!assembleDecklist(deckText, commander).trim()) return notify("Nothing to clone yet.");
    const base = currentDeck?.name || "Untitled deck";
    const name = prompt("Name the copy:", `${base} (copy)`);
    if (!name) return;
    const saved = await saveDeck({ name: name.trim(), format, decklist_text });
    adoptSaved(currentDeck?.id, saved, decklist_text, format);
  }, [currentDeck, saveDeck, format, deckText, commander, maybeboard, notify, adoptSaved]);

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
    if (deck.id !== currentDeck?.id && !confirmDiscardEdits()) return;
    const restored = loadDeck(deck);
    goTo({ tab: "deck", deckId: deck.id });
    notify(restored ? `Opened "${deck.name}" with your unsaved changes.` : `Opened "${deck.name}".`);
  }, [notify, currentDeck, confirmDiscardEdits, loadDeck, goTo]);

  // "Discard changes": the editor goes back to the saved copy. Destructive, so
  // the toast offers Undo instead of asking first.
  const discardChanges = useCallback(() => {
    const deck = decks.find((d) => d.id === currentDeck?.id);
    if (!deck) return notify("Couldn't find the saved copy of this deck.");
    const edits = { format, decklist_text: storageText };
    const fmt = deck.format || "commander";
    setCurrentDeck(_openDeck(deck, showInEditor(fmt, deck.decklist_text).text, fmt));
    notify("Changes discarded.", {
      label: "Undo",
      // Only while this deck is still the open one.
      onClick: () => { if (openIdRef.current === deck.id) showInEditor(edits.format, edits.decklist_text); },
    });
  }, [decks, currentDeck?.id, format, storageText, showInEditor, notify]);

  const addCardToDecklist = useCallback((name) => {
    setDeckText((prev) => `${prev.replace(/\s*$/, "")}\n1 ${name}`);
  }, []);

  // Search tab adds are free choice, so they get the off-color/banned warning.
  // (Planeswalker adds already passed the gate before they got a button.)
  const addCardFromSearch = useCallback((name) => {
    addCardToDecklist(name);
    const cmdr = format === "commander" || format === "paupercommander" ? commander : "";
    const undo = () => setDeckText((prev) => {
      const lines = prev.split("\n");
      const i = lines.lastIndexOf(`1 ${name}`);
      if (i >= 0) lines.splice(i, 1);
      return lines.join("\n");
    });
    warnIfBadAdd({ before: deckText, commander: cmdr, format, name, notify, undo });
  }, [addCardToDecklist, deckText, commander, format, notify]);

  // Card modal "Rules" action → switch to the Rules tab with the card queued
  // up. `ts` makes repeat asks about the same card re-trigger Rules' effect.
  const [rulesPrefill, setRulesPrefill] = useState(null);
  useEffect(() => {
    const onAsk = (e) => {
      const name = e.detail?.name;
      if (!name) return;
      setRulesPrefill({ name, ts: Date.now() });
      setTab("rules");
    };
    window.addEventListener("mtgweb:askrules", onAsk);
    return () => window.removeEventListener("mtgweb:askrules", onAsk);
  }, [setTab]);

  return (
    <div className={deckReady && !playtesting ? "app app-deckview" : "app"}>
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
            stage={playtestStage}
            onClose={() => { setPlaytesting(false); setPlaytestStage(null); }}
          />
        )}
        {wanted && (
          <div className="panel">
            {deckMissing ? (
              <>
                <h2>Deck not found</h2>
                <p className="muted small">
                  This deck isn&apos;t in {cloud ? "your account" : "this browser"}. It may have been
                  deleted, or saved in another browser or account.
                </p>
                <button className="ghost small" onClick={() => setTab("decks")}>← Back to decks</button>
              </>
            ) : (
              <p className="muted small" role="status">Loading deck…</p>
            )}
          </div>
        )}
        {!playtesting && deckReady && (
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
            unsaved={unsaved}
            onDiscard={discardChanges}
            onRenameDeck={renameCurrentDeck}
            onClone={cloneCurrentDeck}
            onExport={exportCurrentDeck}
            onPlaytest={() => { setPlaytestStage(null); setPlaytesting(true); }}
            onGoldfish={(cards) => { setPlaytestStage(cards); setPlaytesting(true); }}
            onShare={shareDeck}
            startInWizard={startInWizard}
            onWizardConsumed={() => setStartInWizard(false)}
            initialCommander={wizardInitialCommander}
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
            onOpenAccount={supabaseEnabled ? () => setSettingsOpen(true) : null}
            onOpenCommander={setCommanderSlug}
          />
        )}
        {tab === "commanders" && (
          <Commanders
            slug={commanderSlug}
            setSlug={setCommanderSlug}
            onBuildWithStrategy={(name) => guidedBuild(name)}
            onBuildFromScratch={(name) => newDeck(null, name)}
            notify={notify}
          />
        )}
        {tab === "rules" && (
          <Rules
            aiAvailable={aiAvailable}
            notify={notify}
            prefill={rulesPrefill}
            onPrefillConsumed={() => setRulesPrefill(null)}
          />
        )}
        {tab === "cards" && <CardSearch addCard={addCardFromSearch} notify={notify} />}
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
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast.text}
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => { clearTimeout(toastTimer.current); setToast(""); toast.action.onClick(); }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
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
        insightsAvailable={deckReady && !playtesting}
        onInsightsSlot={setPwInsightsEl}
        onStatsSlot={setPwStatsEl}
        goals={goals}
      />
      <Feedback open={feedbackOpen} onClose={() => setFeedbackOpen(false)} notify={notify} />
    </div>
  );
}
