import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { supabase, supabaseEnabled } from "./lib/supabase";
import { api, assembleDecklist, assembleForStorage, disassembleDecklist, setAccessToken, warnIfBadAdd } from "./lib/api";
import { commanderDisplay } from "./lib/deckParser";
import { copyLocalDecks, localDecksToCopy, makeStore } from "./lib/store";
import { downloadFile } from "./lib/hooks";
import { historyTopIsGhost, registerTabHandler, useBackClose } from "./lib/backstack";
import { buildPath, parseLocation, resolveDeckRoute } from "./lib/routes";
import { clearDraft, loadDraft, saveDraft } from "./lib/drafts";
import { dropKept, keepDeck, readKept } from "./lib/kept";
import { DEFAULT_GOALS, loadGoals, saveGoals } from "./lib/goals";
import { clearBuildNotes, setBuildNotes } from "./lib/buildNotes";
import GlobalToolbar from "./components/layout/GlobalToolbar";
import BottomNav from "./components/layout/BottomNav";
import ServerStatusBanner from "./components/ServerStatusBanner";
import DeckView from "./components/deck/DeckView";
import NewDeck from "./components/NewDeck";
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

// The four places the bars name: id, label, address. A deck is a page under
// Decks, and the New deck screen is an action beside them, not a place.
const PLACES = [
  ["decks", "Decks", "/"],
  ["commanders", "Commanders", "/commanders"],
  ["cards", "Cards", "/cards"],
  ["rules", "Rules", "/rules"],
];

// The name a blank deck is made with (NewDeck's BLANK). Its first commander
// replaces it on the next Save.
const UNTITLED = "Untitled deck";

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
    // The deck is saved on arrival and the address becomes /decks/<id>
    // (lib/routes drops the param then). Until that save lands the param stays,
    // so a reload still finds the deck; opening the link again content-dedups
    // onto the saved deck, keeping its goals, session log, and chat history.
    const decklist_text = assembleForStorage(decoded, cmd, "");
    return decklist_text.trim() ? { format: fmt, decklist_text, commander: cmd } : null;
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
  // app's one history mechanism, not a second router. The deck tab with no id
  // is the New deck screen, and `seed` there is a commander its address names.
  // A share link always opens its deck: it waits on that screen's address
  // until the deck is saved (`shared`, below).
  const [route, setRoute] = useState(() => (
    _shared ? { tab: "deck", slug: null, deckId: null } : parseLocation(window.location)
  ));
  const { tab } = route;
  // Which commander page is open within the Commanders tab (/commanders/<slug>).
  const commanderSlug = route.slug;
  // A share link's deck on its way in: "saving", "failed" (with Try again), or
  // null once it is a saved deck like any other, or there was no link.
  const [shared, setShared] = useState(_shared ? "saving" : null);
  // How many moves the app has made (`moves`, below), as of the last one. The
  // New deck screen is keyed by it, so every arrival there is a fresh screen
  // (pressing "New deck" on that screen included), and a deck it makes carries
  // the number it was asked under.
  const [visit, setVisit] = useState(0);
  // What the deck page shows once for a deck just made: { deckId, review } (the
  // upgrade guide after a paste or import) or { deckId, buy } (a collection
  // build's buy list). It belongs to that deck alone.
  const [arrival, setArrival] = useState(null);
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
  const [deckText, setDeckText] = useState("");
  const [format, setFormat] = useState("commander");
  const [commander, setCommander] = useState("");
  const [maybeboard, setMaybeboard] = useState("");
  // The saved deck in the editor ({ id, name, saved }, see _openDeck), or null
  // when the editor is empty. There is no deck without an id: every way of
  // starting one saves it first (createDeck).
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

  // Load the deck's saved goals when the open deck changes; persist on edit.
  useEffect(() => {
    setGoalsState(loadGoals(currentDeck?.id || null)); // eslint-disable-line react-hooks/set-state-in-effect
  }, [currentDeck?.id]);
  const setGoals = useCallback((g) => {
    setGoalsState(g);
    saveGoals(currentDeck?.id || null, g);
  }, [currentDeck?.id]);

  // Refs so the callbacks below read the present without depending on it.
  const openIdRef = useRef(null);
  const userIdRef = useRef(null);
  // Counts every move: a link, a tab, Back, Forward. A new deck comes back
  // after its build and its save, which can be a minute, and this is how
  // createDeck tells whether the person is still on the screen that asked.
  const moves = useRef(0);
  const moved = useCallback(() => setVisit(++moves.current), []);
  const routeRef = useRef(route);
  useEffect(() => {
    openIdRef.current = currentDeck?.id || null;
    userIdRef.current = session?.user?.id || null;
    routeRef.current = route;
  });

  // Every move in the app. A route carries a deck id only on the deck tab, and
  // going to that tab means the deck the editor already holds (/new if none).
  // A commander named for a new deck goes no further than the screen it names.
  const goTo = useCallback((next) => {
    moved();
    setRoute((r) => ({ ...r, deckId: null, seed: null, ...next }));
  }, [moved]);
  const setTab = useCallback((t) => {
    goTo(t === "deck" ? { tab: t, deckId: openIdRef.current } : { tab: t });
  }, [goTo]);
  const setCommanderSlug = useCallback((slug) => goTo({ tab: "commanders", slug }), [goTo]);

  // A deck's edits are kept as its draft, so leaving loses nothing. Only when
  // that write failed (storage full or blocked) is there something to ask about.
  const confirmDiscardEdits = useCallback(() => (
    !openIdRef.current || draftKept.current || window.confirm("You have unsaved deck changes. Discard them?")
  ), []);

  // The generator's per-card notes describe one deck and are keyed by card
  // name alone, so they have to go the moment a different deck is on screen.
  // emptyEditor and loadDeck are every way that happens; createDeck sets them
  // again after it loads the deck they belong to.
  const emptyEditor = useCallback(() => {
    clearBuildNotes();
    setDeckText("");
    setCommander("");
    setMaybeboard("");
    setFormat("commander");
    setCurrentDeck(null);
  }, []);

  // Put a saved deck in the editor. Edits left unsaved last time come back on
  // top of the saved copy, and the deck shows as unsaved. Returns whether any did.
  const loadDeck = useCallback((deck) => {
    clearBuildNotes();
    const fmt = deck.format || "commander";
    const shown = showInEditor(fmt, deck.decklist_text);
    setCurrentDeck(_openDeck(deck, shown.text, fmt));
    const draft = loadDraft(deck.id);
    if (draft) showInEditor(draft.format || fmt, draft.decklist_text);
    return Boolean(draft);
  }, [showInEditor]);

  // "New deck", from anywhere: the New deck screen, fresh. `seed` is a
  // commander to start from (a commander page's link); the bars pass none.
  const startNew = useCallback((seed) => {
    if (!confirmDiscardEdits()) return;
    setShared(null);
    goTo({ tab: "deck", seed: typeof seed === "string" ? seed : null });
  }, [confirmDiscardEdits, goTo]);

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
      if (layerClosed) {
        // Back closed a layer and the app stays where it is. The entry now on
        // top was pushed before the layer opened, and the app may have moved
        // on from its address since (a deck saved while a panel was open over
        // the New deck screen), so the address is put right.
        const { pathname, search, hash } = window.location;
        const want = buildPath(routeRef.current, search) + hash;
        if (want !== pathname + search + hash) window.history.replaceState(window.history.state, "", want);
        return;
      }
      const next = parseLocation(window.location);
      // A pop that changes nothing (the skip link's #main-content) is not a
      // move: it must not reset the New deck screen or orphan a deck in flight.
      if (buildPath(next) !== buildPath(routeRef.current)) moved();
      setRoute(next);
    });
  }, [moved]);

  const addressSynced = useRef(false);
  const { deckId } = route;
  const seed = (tab === "deck" && !deckId && route.seed) || null;
  // A layout effect, so the address is settled before any passive effect runs.
  // A deck can arrive with a layer already open over it (the upgrade guide
  // after a paste), and a child's effects run before this component's: as a
  // passive effect this ran after the guide had pushed its history entry, and
  // replaced that entry, leaving the /new beneath it standing.
  useLayoutEffect(() => {
    const { pathname, search, hash } = window.location;
    const slug = tab === "commanders" ? commanderSlug : null;
    const next = buildPath({ tab, slug, deckId, seed }, search) + hash;
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
    if (here.tab === tab && here.slug === slug && here.deckId === deckId && (here.seed || null) === seed) return;
    // A deck taking the place of /new (a deck just made there, or a share
    // link's deck just saved) keeps that place in history: /new becomes
    // /decks/<id>, so Back doesn't return to the screen it was made on.
    const savedFromNew = here.tab === "deck" && !here.deckId && deckId;
    // Recycle an abandoned layer entry rather than stacking on top of it.
    if (savedFromNew || historyTopIsGhost()) window.history.replaceState({ tab }, "", next);
    else window.history.pushState({ tab }, "", next);
  }, [tab, commanderSlug, deckId, seed]);

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
      // Only a deck whose draft could not be written needs the browser's prompt.
      if (currentDeck?.id && !draftKept.current) { e.preventDefault(); }
      if (supabaseEnabled && localStorage.getItem("mtgweb:rememberMe") === "false") {
        supabase.auth.signOut();
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [currentDeck?.id]);

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
  // unsaved edits stay in its draft.
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

  // This browser's decks not yet in the signed-in account. Only once the
  // account's own list is in, and read again each time it reloads, which is
  // what a copy ends with.
  const accountListIn = cloud && decksLoadedFor === userId;
  // `decks` is the trigger, not an input: the marks a copy writes are read here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toCopy = useMemo(() => (accountListIn ? localDecksToCopy(userId) : []), [accountListIn, userId, decks]);
  // New decks whose save failed (lib/kept), the ones this account made. None
  // until the sign-in check settles: until then a signed-in person reads as
  // signed out and would be offered that person's decks.
  const [keptAll, setKeptAll] = useState(readKept);
  // `busy` while its Try again is out, on whichever screen it was pressed.
  const [retryingIds, setRetryingIds] = useState([]);
  const kept = useMemo(() => (authReady
    ? keptAll.filter((e) => e.owner === userId).map((e) => ({ ...e, busy: retryingIds.includes(e.id) }))
    : []), [keptAll, authReady, userId, retryingIds]);

  // Held here, not on Decks home: leaving the page and coming back mid-copy
  // must not offer a second copy of the decks not yet marked.
  const [copying, setCopying] = useState(false);
  const copyingRef = useRef(false);
  const copyToAccount = useCallback(async () => {
    if (copyingRef.current) return;
    copyingRef.current = true;
    setCopying(true);
    try {
      const { copied, failed } = await copyLocalDecks(userId, () => userIdRef.current === userId);
      const n = (k) => `${k} deck${k !== 1 ? "s" : ""}`;
      if (userIdRef.current !== userId) {
        notify(`Copied ${n(copied)} before the account changed. The rest are still in this browser.`);
        return;
      }
      await refresh();
      notify(failed
        ? `Copied ${n(copied)}. ${n(failed)} could not be copied; try again.`
        : `Copied ${n(copied)} to your account.`);
    } finally {
      copyingRef.current = false;
      setCopying(false);
    }
  }, [userId, refresh, notify]);

  // The address names the deck and the editor follows it. Opening a deck from
  // the list fills the editor itself (openDeck), so this only has work to do
  // when the address moved first: a cold load, a second browser tab, Back,
  // Forward. DeckView stays unmounted until the two agree.
  const editorId = currentDeck?.id || null;
  const deckReady = tab === "deck" && Boolean(deckId) && deckId === editorId;
  // The New deck screen (/new): the deck tab with no deck named.
  const atNew = tab === "deck" && !deckId;
  // The place the bars light: a deck is a page under Decks, /new is no place.
  const place = tab === "deck" ? (deckId ? "decks" : null) : tab;
  const wanted = tab === "deck" && deckId && !deckReady
    ? resolveDeckRoute({ deckId, decks, decksLoadedFor, authReady, userId })
    : null;
  const wantedDeck = wanted?.deck || null;
  // Setting state from this effect is its job: the address is the outside
  // system, and the deck list it resolves against arrives after the first render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (tab !== "deck" || deckReady) return;
    // /new with a saved deck still in the editor (its edits are in its draft):
    // the New deck screen starts from nothing.
    if (!deckId) { if (editorId) emptyEditor(); } else if (wantedDeck) loadDeck(wantedDeck);
  }, [tab, deckReady, deckId, wantedDeck, editorId, emptyEditor, loadDeck]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The browser title names the place, and on a deck address the deck.
  const deckMissing = wanted?.status === "missing";
  useEffect(() => {
    const names = { decks: "Decks", commanders: "Commanders", rules: "Rules", cards: "Card Search" };
    const deckTitle = atNew ? "New deck" : deckMissing ? "Deck not found" : currentDeck?.name || "Deck";
    document.title = `${tab === "deck" ? deckTitle : names[tab] || "MTG Workshop"} · MTG Workshop`;
  }, [tab, atNew, deckMissing, currentDeck?.name]);

  // A save comes back after an await, and the editor may hold another deck by
  // then. Only the deck that was saved takes the saved copy: on any other deck
  // it would turn that deck's whole text into unsaved edits and a draft. A
  // clone gets its id here, and its address with it. Returns whether it applied.
  const adoptSaved = useCallback((wasId, saved, text, fmt) => {
    if (openIdRef.current !== wasId) return false;
    setCurrentDeck(_openDeck(saved, text, fmt));
    if (saved.id !== wasId) setRoute((r) => (r.tab === "deck" ? { ...r, deckId: saved.id } : r));
    return true;
  }, []);

  // `full` is a deck as assembleDecklist gives it.
  const copyShareLink = useCallback((full, fmt, cmd) => {
    if (!full.trim()) return notify("No deck to share.");
    const encoded = _b64encode(full);
    const params = new URLSearchParams({ deck: encoded, fmt });
    if (cmd) params.set("cmd", cmd);
    // From "/", not the current path: the Share toast outlives a tab switch.
    const url = `${window.location.origin}/?${params}`;
    navigator.clipboard.writeText(url).then(
      () => notify("Share link copied to clipboard!"),
      () => notify("Couldn't copy — check browser permissions."),
    );
  }, [notify]);
  const shareDeck = useCallback(
    () => copyShareLink(assembleDecklist(deckText, commander), format, commander),
    [copyShareLink, deckText, commander, format],
  );

  const saveDeck = useCallback(async (deck) => {
    const saved = await store.save(deck);
    // A save from outside the editor (a rename in the deck list) can be of the
    // deck the editor holds. Its name follows, or the editor's next Save
    // would write the old one back.
    if (saved.id === openIdRef.current) setCurrentDeck((d) => (d?.id === saved.id ? { ...d, name: saved.name } : d));
    await refresh();
    // Share-after-save: the moment a deck is saved is the moment sharing it
    // becomes meaningful — offer it right on the toast.
    notify("Saved.", { label: "🔗 Share link", onClick: shareDeck });
    return saved;
  }, [store, refresh, notify, shareDeck]);

  // Put a deck that is already saved on screen at its own address, in the
  // place of the New deck screen (a deck just made, a share link's deck).
  const showSaved = useCallback((deck) => {
    loadDeck(deck);
    setRoute((r) => ({ ...r, tab: "deck", deckId: deck.id, seed: null }));
  }, [loadDeck]);

  // A deck is saved the moment it is created. Every way of starting one ends
  // here: the doors of the New deck screen and a share link's arrival. It
  // saves first, then puts the deck in the editor at /decks/<id>, so nothing
  // in the app is ever a deck without an id. Throws if the save fails: the
  // caller still holds what it made.
  //
  // `asked` is the move count of the screen that asked for the deck. If the
  // person has moved on since (any link, Back, "New deck" again), during the
  // build or the save, or the account has changed, the deck is not opened over
  // what they are looking at: it is saved, and the toast offers it.
  //
  // With `keep`, a deck with cards whose save fails is kept in this browser
  // for the account that made it, and the error says whether that worked
  // (`kept`). It is kept here, not on the screen that asked, because that
  // screen may be gone ("New deck" pressed during the build).
  const createDeck = useCallback(async (deck, asked, { keep = false } = {}) => {
    const { name, format: fmt = "commander", decklist_text, notes, arrival: onArrival, toast } = deck;
    // The account whose `store` this is: the one signed in when the door was
    // pressed. A build can take a minute, and this function is only entered
    // after it, so the account "now" would already be the changed one.
    const askedBy = userId;
    let saved;
    try {
      saved = await store.save({ name, format: fmt, decklist_text });
    } catch (e) {
      if (keep && decklist_text?.trim()) {
        e.kept = Boolean(keepDeck(askedBy, deck));
        setKeptAll(readKept());
      }
      throw e;
    }
    await refresh();
    const { commander: cmd, deckText: cards } = disassembleDecklist(decklist_text);
    const share = { label: "🔗 Share link", onClick: () => copyShareLink(assembleDecklist(cards, cmd), fmt, cmd) };
    if (asked !== moves.current || askedBy !== userIdRef.current) {
      // Openable only by the account that asked for it: that is whose list it is in.
      if (askedBy === userIdRef.current) {
        notify(`Saved as "${saved.name}".`, {
          label: "Open",
          onClick: () => { if (askedBy === userIdRef.current) { loadDeck(saved); goTo({ tab: "deck", deckId: saved.id }); } },
        });
      } else {
        // The account changed while it was built or saved. It is not opened,
        // but it is said where it went, or the next move is to build (and pay) again.
        notify(askedBy
          ? `Saved "${saved.name}" to the account that was signed in when it was started.`
          : `Saved "${saved.name}" to this browser's decks, not your account: it was started before you signed in.`);
      }
      return saved;
    }
    showSaved(saved);
    // Set after the load, which clears the notes of whatever deck came before.
    if (notes) setBuildNotes(notes);
    setArrival(onArrival ? { ...onArrival, deckId: saved.id } : null);
    notify(toast || `Saved as "${saved.name}".`, share);
    return saved;
  }, [store, userId, refresh, notify, copyShareLink, showSaved, loadDeck, goTo]);

  // A kept deck: Try again saves and opens it like a new one, and only a
  // save that went through drops it. One try at a time per deck, held here
  // and not in the panel: leaving for the other screen mid-try and pressing
  // Try again there would otherwise save it twice.
  //
  // A deck the account already has, same name, format and cards, is not saved
  // again: its save may have reached the server after all (a reload while the
  // answer was on its way), or the same door was pressed again, or another tab
  // saved it. The kept copy goes and the saved one opens.
  const retrying = useRef(new Set());
  const retryKept = useCallback(async (entry) => {
    if (retrying.current.has(entry.id)) return;
    // Saved or discarded in another tab since this list was read.
    if (!readKept().some((e) => e.id === entry.id)) { setKeptAll(readKept()); return; }
    retrying.current.add(entry.id);
    setRetryingIds([...retrying.current]);
    const d = entry.deck;
    try {
      const asked = moves.current;
      const same = (await store.list()).find((s) =>
        s.name === d.name && s.decklist_text === d.decklist_text && (s.format || "commander") === (d.format || "commander"));
      if (same) {
        if (asked === moves.current) showSaved(same);
        notify(`"${d.name}" was already saved.`);
      } else {
        await createDeck(d, asked);
      }
      dropKept(entry.id);
    } catch (e) {
      notify(`Still couldn't save "${d.name}": ${e.message}`);
    } finally {
      retrying.current.delete(entry.id);
      setRetryingIds([...retrying.current]);
      setKeptAll(readKept());
    }
  }, [createDeck, notify, store, showSaved]);
  const discardKept = useCallback((entry) => { dropKept(entry.id); setKeptAll(readKept()); }, []);

  // A share link's deck is saved on arrival, like any other new deck. Opening
  // the same link again finds the deck it already made (same contents) and
  // opens that one, with any edits left in its draft, in place of a duplicate.
  const openShared = useCallback(async () => {
    const asked = moves.current;
    try {
      const dup = (await store.list()).find((d) => d.decklist_text === _shared.decklist_text);
      if (!dup) {
        const name = _shared.commander ? commanderDisplay(_shared.commander) : "Imported deck";
        await createDeck({ name, format: _shared.format, decklist_text: _shared.decklist_text }, asked);
      } else if (asked === moves.current) showSaved(dup);
      setShared(null);
    } catch (e) {
      setShared("failed");
      notify(`Couldn't save this shared deck: ${e.message}`);
    }
  }, [_shared, store, createDeck, showSaved, notify]);

  // Wait for the Supabase session check to resolve first — otherwise a
  // signed-in user's deck silently saves to browser-local storage instead of
  // their account (userId reads as null until this settles).
  const sharedStarted = useRef(false);
  useEffect(() => {
    if (!_shared || !authReady || sharedStarted.current) return;
    sharedStarted.current = true;
    openShared();
  }, [_shared, authReady, openShared]);

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
            // copiedTo: a browser deck already copied to an account stays copied.
            await saveDeck({ id: doomed.id, name: doomed.name, format: doomed.format, decklist_text: doomed.decklist_text, copiedTo: doomed.copiedTo });
            notify(`Restored "${doomed.name}".`);
          } catch {
            if (draft) clearDraft(doomed.id);
            notify("Couldn't restore the deck.");
          }
        },
      },
    );
  }, [store, refresh, notify, decks, saveDeck, emptyEditor]);

  // Save from the deck view: the open deck, in place. A blank deck is made as
  // "Untitled deck"; while it still has that name, its first commander names
  // it, as picking a commander always has. A deck that was renamed keeps its name.
  const saveCurrentDeck = useCallback(async () => {
    if (!currentDeck?.id) return;
    const decklist_text = assembleForStorage(deckText, commander, maybeboard);
    if (!assembleDecklist(deckText, commander).trim()) return notify("Nothing to save yet.");
    const name = currentDeck.name === UNTITLED && commander ? commanderDisplay(commander) : currentDeck.name;
    const saved = await saveDeck({ id: currentDeck.id, name, format, decklist_text });
    adoptSaved(currentDeck.id, saved, decklist_text, format);
  }, [currentDeck, saveDeck, format, deckText, commander, maybeboard, notify, adoptSaved]);

  // Rename the open deck. It persists immediately.
  const renameCurrentDeck = useCallback(async (name) => {
    const trimmed = (name || "").trim().slice(0, 80);
    if (!trimmed || !currentDeck?.id) return;
    const decklist_text = assembleForStorage(deckText, commander, maybeboard);
    const saved = await saveDeck({ id: currentDeck.id, name: trimmed, format, decklist_text });
    adoptSaved(currentDeck.id, saved, decklist_text, format);
    notify(`Renamed to "${saved.name}".`);
  }, [currentDeck, saveDeck, format, deckText, commander, maybeboard, notify, adoptSaved]);

  // Clone: always create a NEW deck (no id), copying the current contents.
  const cloneCurrentDeck = useCallback(async () => {
    if (!currentDeck?.id) return;
    const decklist_text = assembleForStorage(deckText, commander, maybeboard);
    if (!assembleDecklist(deckText, commander).trim()) return notify("Nothing to clone yet.");
    const name = prompt("Name the copy:", `${currentDeck.name || UNTITLED} (copy)`);
    if (!name) return;
    const saved = await saveDeck({ name: name.trim(), format, decklist_text });
    adoptSaved(currentDeck.id, saved, decklist_text, format);
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
        places={PLACES}
        place={place}
        setTab={setTab}
        cloud={cloud}
        session={session}
        setSettingsOpen={setSettingsOpen}
        onNewDeck={startNew}
        onDeck={deckReady}
        onSignOut={() => { supabase.auth.signOut(); notify("Signed out."); }}
        avatarMenuOpen={avatarMenuOpen}
        setAvatarMenuOpen={setAvatarMenuOpen}
        onFeedback={FEEDBACK_ENABLED ? () => setFeedbackOpen(true) : null}
      />

      <main id="main-content">
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
            arrival={arrival?.deckId === currentDeck?.id ? arrival : null}
            onArrivalDone={() => setArrival(null)}
            onBack={() => setTab("decks")}
            notify={notify}
            serverWarmed={serverWarmed}
            pwInsightsEl={pwInsightsEl}
            pwStatsEl={pwStatsEl}
            goals={goals}
            setGoals={setGoals}
          />
        )}
        {atNew && shared && (
          <div className="panel">
            {shared === "failed" ? (
              <>
                <h2>This shared deck isn&apos;t saved yet</h2>
                <p className="muted small">
                  A shared deck is saved to {cloud ? "your account" : "this browser"} before it opens, and
                  that save didn&apos;t go through.
                </p>
                <button className="primary" onClick={() => { setShared("saving"); openShared(); }}>Try again</button>
              </>
            ) : (
              <p className="muted small" role="status">Opening the shared deck…</p>
            )}
          </div>
        )}
        {/* Not before the sign-in check settles: until then the app reads as
            signed out, and a deck made now would be saved to this browser. */}
        {atNew && !shared && (authReady ? (
          <NewDeck key={visit} seed={seed} onCreate={(deck) => createDeck(deck, visit, { keep: true })} notify={notify}
            kept={kept} onRetryKept={retryKept} onDiscardKept={discardKept} />
        ) : (
          <div className="panel"><p className="muted small" role="status">Loading…</p></div>
        ))}
        {tab === "decks" && (
          <MyDecks
            decks={decks}
            signedIn={supabaseEnabled ? Boolean(session) : null}
            cloud={cloud}
            onSave={saveDeck}
            onDelete={deleteDeck}
            onOpen={openDeck}
            onPlaytest={(deck) => { openDeck(deck); setPlaytesting(true); }}
            onNewDeck={startNew}
            notify={notify}
            setTab={setTab}
            onOpenAccount={supabaseEnabled ? () => setSettingsOpen(true) : null}
            onOpenCommander={setCommanderSlug}
            toCopy={toCopy.length}
            onCopyToAccount={copyToAccount}
            copying={copying}
            kept={kept}
            onRetryKept={retryKept}
            onDiscardKept={discardKept}
          />
        )}
        {tab === "commanders" && (
          <Commanders
            slug={commanderSlug}
            setSlug={setCommanderSlug}
            onBuild={startNew}
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
        {tab === "cards" && (
          <CardSearch
            // No deck in the editor, nothing to add to: every deck has an id
            // now, so there is no new deck in the making to catch the card.
            addCard={currentDeck ? addCardFromSearch : null}
            notify={notify}
            deckName={currentDeck ? currentDeck.name || UNTITLED : null}
            deckHref={buildPath({ tab: "deck", deckId: currentDeck?.id || null })}
            onBackToDeck={() => setTab("deck")}
          />
        )}
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
      <BottomNav places={PLACES} place={place} setTab={setTab} onNewDeck={startNew} onNew={atNew} />
      <Planeswalker
        decklist={deckText}
        commander={commander}
        format={format}
        aiAvailable={aiAvailable}
        serverStatus={serverStatus}
        addCard={currentDeck ? addCardToDecklist : null}
        addToConsidering={currentDeck ? addToConsidering : null}
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
