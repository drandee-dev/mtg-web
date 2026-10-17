import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { historyTopIsGhost, registerTabHandler } from "./backstack";
import { buildPath, parseLocation } from "./routes";

// Where the app is, and every move it makes (UX refactor R4b; this was a block
// of App.jsx). The route is { tab, slug, deckId, seed? }, the shape lib/routes
// reads from the address (/rules, /commanders/<slug>, /decks/<id>, /new),
// kept in step with the browser's history through lib/backstack: the app's one
// history mechanism, not a second router. The deck tab with no id is the New
// deck screen, and `seed` there is a commander its address names.
//
// `initialRoute` is a function, called once. `openIdRef` is a ref to the id of
// the deck the editor holds: going to the deck tab means that deck (/new if
// none). The caller keeps `openIdRef.current` up to date. `getMoves()` is how
// many moves the app has made so far.
export function useAppRoute({ initialRoute, openIdRef }) {
  const [route, setRoute] = useState(initialRoute);
  const { tab, deckId } = route;
  // Which commander page is open within the Commanders tab (/commanders/<slug>).
  const commanderSlug = route.slug;
  // How many moves the app has made (`moves`), as of the last one. The New deck
  // screen is keyed by it, so every arrival there is a fresh screen (pressing
  // "New deck" on that screen included), and a deck it makes carries the number
  // it was asked under.
  const [visit, setVisit] = useState(0);
  // `moves` counts every move: a link, a tab, Back, Forward. A new deck comes
  // back after its build and its save, which can be a minute, and this is how
  // createDeck tells whether the person is still on the screen that asked.
  const moves = useRef(0);
  const moved = useCallback(() => setVisit(++moves.current), []);
  const getMoves = useCallback(() => moves.current, []);
  // The route as of the last render, for callbacks that must not depend on it.
  const routeRef = useRef(route);
  useEffect(() => {
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
  }, [goTo, openIdRef]);
  const setCommanderSlug = useCallback((slug) => goTo({ tab: "commanders", slug }), [goTo]);

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

  // Scroll restoration per tab: the window's scroll position, restored when a
  // tab is opened again.
  const tabScroll = useRef({});
  useEffect(() => {
    const scrolls = tabScroll.current;
    window.scrollTo(0, scrolls[tab] || 0);
    return () => { scrolls[tab] = window.scrollY; };
  }, [tab]);

  return {
    route, setRoute, tab, deckId, commanderSlug, seed, visit, getMoves,
    goTo, setTab, setCommanderSlug,
  };
}
