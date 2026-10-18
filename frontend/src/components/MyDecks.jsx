import { useEffect, useMemo, useState, useRef } from "react";
import { disassembleDecklist, getCardImage, FORMATS } from "../lib/api";
import { commanderNamesClean } from "../lib/deckParser";
import { useCardImage } from "../lib/hooks";
import { buildPath } from "../lib/routes";
import ExportDeckModal from "./ExportDeckModal";
import KeptDecks from "./KeptDecks";
import NavLink from "./layout/NavLink";

const WUBRG_COLORS = ["W", "U", "B", "R", "G"];
const FORMAT_LABEL = Object.fromEntries(FORMATS);
// Search, filter and sort earn their room once the grid runs past two rows.
const SEARCH_FROM = 9;

// Command Tower's art.
const WELCOME_ART = "https://cards.scryfall.io/art_crop/front/1/a/1ac6cb62-45da-4e9a-84c6-09e6eacf0664.jpg";

// A curated five rather than the top five by EDHREC rank, because ranking them
// means loading the whole commander directory (~505KB over the wire). Each
// tile resolves its own art through the cached per-card lookup. Slugs checked
// against the directory, so none of these dead-end.
const TEASER_COMMANDERS = [
  { name: "Atraxa, Praetors' Voice", slug: "atraxa-praetors-voice", tag: "Superfriends" },
  { name: "Krenko, Mob Boss", slug: "krenko-mob-boss", tag: "Goblin tokens" },
  { name: "Muldrotha, the Gravetide", slug: "muldrotha-the-gravetide", tag: "Graveyard value" },
  { name: "Isshin, Two Heavens as One", slug: "isshin-two-heavens-as-one", tag: "Combat triggers" },
  { name: "Miirym, Sentinel Wyrm", slug: "miirym-sentinel-wyrm", tag: "Dragon tribal" },
];

// Commander art + color identity never change for a given card, so cache them in
// localStorage keyed by commander name — decks paint instantly on return visits.
const META_CACHE_KEY = "mtgweb:commanderMeta";

function readMetaCache() {
  try { return JSON.parse(localStorage.getItem(META_CACHE_KEY)) || {}; } catch { return {}; }
}

function writeMetaCache(cache) {
  try { localStorage.setItem(META_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota — skip */ }
}

function deckCardCount(text) {
  return (text || "").split("\n")
    .filter((l) => /^\s*\d/.test(l) && !/^\s*commander\s*$/i.test(l))
    .reduce((s, l) => s + (parseInt(l.trim(), 10) || 0), 0);
}

// "100 cards", or how far off it is: a Commander deck is exactly 100, a
// constructed deck at least 60.
function cardsFact(deck) {
  const count = deckCardCount(deck.decklist_text);
  const isCmdr = !deck.format || deck.format === "commander" || deck.format === "paupercommander";
  const target = isCmdr ? 100 : 60;
  const off = isCmdr && count > target ? `, ${count - target} over`
    : count < target ? `, ${target - count} short` : "";
  return { text: `${count} cards${off}`, off: Boolean(off) };
}

function formatLabel(deck) {
  return FORMAT_LABEL[deck.format || "commander"] || deck.format;
}

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? "s" : ""} ago`;
}

const deckHref = (deck) => buildPath({ tab: "deck", deckId: deck.id });

function DeckTile({ deck, meta, onOpen, onPlaytest, onDelete, onRename, onClone, onExport }) {
  const art = meta?.art_crop;
  const colors = meta?.color_identity || [];
  // Equal-width segment per identity color (colorless commanders get a C segment).
  const barColors = meta ? (colors.length > 0 ? WUBRG_COLORS.filter((c) => colors.includes(c)) : ["C"]) : [];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    function onKey(e) {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuRef.current?.querySelector(".deck-card-menu-btn")?.focus();
    }
    document.addEventListener("pointerdown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const cards = cardsFact(deck);
  const act = (fn) => () => { setMenuOpen(false); fn(deck); };

  return (
    <div className={`deck-card${menuOpen ? " deck-card-menu-open" : ""}`}>
      <NavLink href={deckHref(deck)} onNavigate={() => onOpen(deck)} className="deck-card-link">
        <span className="deck-card-art">
          {art ? <img src={art} alt="" loading="lazy" /> : <span className="deck-card-art-ph" />}
        </span>
        {barColors.length > 0 && (
          <span className="deck-card-colorbar" role="img" aria-label={`Colors: ${barColors.join(", ")}`}>
            {barColors.map((c) => <span key={c} className={`deck-card-colorseg colorseg-${c}`} />)}
          </span>
        )}
        <span className="deck-card-body">
          <span className="deck-card-name" title={deck.name || "Untitled deck"}>{deck.name || "Untitled deck"}</span>
          <span className="deck-card-facts">
            {formatLabel(deck)}, <span className={cards.off ? "dh-off" : undefined}>{cards.text}</span>
          </span>
          {deck.updated_at && <span className="deck-card-time">Edited {relativeTime(deck.updated_at)}</span>}
        </span>
      </NavLink>
      <div className="deck-card-menu-wrap" ref={menuRef}>
        <button className="deck-card-menu-btn" onClick={() => setMenuOpen((o) => !o)}
          aria-label={`Actions for ${deck.name || "Untitled deck"}`} aria-expanded={menuOpen}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/></svg>
        </button>
        {menuOpen && (
          <div className="deck-card-menu">
            <button className="deck-card-menu-item" onClick={act(onRename)}>Rename</button>
            <button className="deck-card-menu-item" onClick={act(onClone)}>Clone deck</button>
            <div className="deck-card-menu-divider" />
            <button className="deck-card-menu-item" onClick={act(onExport)}>Export…</button>
            <button className="deck-card-menu-item" onClick={act(onPlaytest)}>Playtest</button>
            <div className="deck-card-menu-divider" />
            <button className="deck-card-menu-item deck-card-menu-danger" onClick={act((d) => onDelete(d.id))}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TeaserTile({ entry, onOpen }) {
  const data = useCardImage(entry.name);
  const img = data?.art_crop || data?.image || null;
  return (
    <NavLink href={buildPath({ tab: "commanders", slug: entry.slug })} onNavigate={() => onOpen(entry.slug)} className="teaser-tile">
      <span className="teaser-tile-art">{img && <img src={img} alt="" loading="lazy" />}</span>
      <span className="teaser-tile-name" title={entry.name}>{entry.name.split(",")[0]}</span>
      <span className="teaser-tile-tag">{entry.tag}</span>
    </NavLink>
  );
}

export default function MyDecks({ decks, signedIn, onSave, onDelete, onOpen, onPlaytest, onNewDeck, notify, setTab, onOpenAccount, onOpenCommander, toCopy = 0, onCopyToAccount, copying = false, kept, onRetryKept, onDiscardKept }) {
  const [syncNudgeDismissed, setSyncNudgeDismissed] = useState(
    () => { try { return localStorage.getItem("mtgweb:syncnudge") === "1"; } catch { return true; } }
  );
  const showSyncNudge = signedIn === false && decks.length >= 2 && !syncNudgeDismissed && onOpenAccount;
  function dismissSyncNudge() {
    try { localStorage.setItem("mtgweb:syncnudge", "1"); } catch { /* best-effort */ }
    setSyncNudgeDismissed(true);
  }
  const [fetchedMeta, setFetchedMeta] = useState({});
  // Most recently edited deck, for the resume band. Sorts a copy: decks is a
  // prop and sorting it in place would reorder the caller's array.
  const mostRecent = useMemo(
    () => [...decks].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))[0],
    [decks],
  );
  const [deckSearch, setDeckSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");
  const [sortDir, setSortDir] = useState("desc");
  const [exportModalDeck, setExportModalDeck] = useState(null);
  // Cached commanders resolve at render time (instant paint); the rest are listed
  // in `missing` for the fetch effect below.
  const { cachedMeta, missing } = useMemo(() => {
    const cache = readMetaCache();
    const cachedMeta = {};
    const missing = [];
    for (const deck of decks) {
      const { commander } = disassembleDecklist(deck.decklist_text);
      if (!commander) continue;
      const cmdrName = commanderNamesClean(commander)[0];
      if (cache[cmdrName]) cachedMeta[deck.id] = cache[cmdrName];
      else missing.push([deck.id, cmdrName]);
    }
    return { cachedMeta, missing };
  }, [decks]);

  const deckMeta = useMemo(() => ({ ...cachedMeta, ...fetchedMeta }), [cachedMeta, fetchedMeta]);

  useEffect(() => {
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const cache = readMetaCache();
      let dirty = false;
      for (const [id, cmdrName] of missing) {
        if (cancelled) break;
        try {
          const data = await getCardImage(cmdrName);
          if (data?.found) {
            const entry = {
              art_crop: data.art_crop,
              color_identity: data.color_identity,
              bracket: null,
            };
            cache[cmdrName] = entry;
            dirty = true;
            if (!cancelled) setFetchedMeta((m) => ({ ...m, [id]: entry }));
          }
        } catch { /* ignore */ }
      }
      if (dirty) writeMetaCache(cache);
    })();
    return () => { cancelled = true; };
  }, [missing]);

  async function rename(deck) {
    const name = prompt("Rename deck:", deck.name);
    if (name && name !== deck.name) await onSave({ ...deck, name });
  }

  // Clone: create a NEW deck (no id) with the same contents, like App.jsx's clone.
  async function clone(deck) {
    const name = prompt("Name the copy:", `${deck.name || "Untitled deck"} (copy)`);
    if (!name) return;
    await onSave({ name: name.trim(), format: deck.format, decklist_text: deck.decklist_text });
    notify("Deck cloned.");
  }

  const searchable = decks.length >= SEARCH_FROM;
  const shown = searchable ? decks.filter((d) => {
    if (deckSearch && !d.name?.toLowerCase().includes(deckSearch.toLowerCase())) return false;
    if (formatFilter !== "all" && d.format !== formatFilter) return false;
    return true;
  }) : decks;
  const sorted = [...shown].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "updated") cmp = (a.updated_at || "").localeCompare(b.updated_at || "");
    else if (sortBy === "name") cmp = (a.name || "").localeCompare(b.name || "");
    else if (sortBy === "format") cmp = (a.format || "").localeCompare(b.format || "");
    return sortDir === "desc" ? -cmp : cmp;
  });

  // Hidden at one deck, where the band and the grid would show the same deck
  // twice over. The page's main heading is the band's deck when it shows.
  const resume = decks.length > 1 ? mostRecent : null;
  const ListHeading = resume ? "h2" : "h1";
  const resumeArt = resume ? deckMeta[resume.id]?.art_crop : null;
  const resumeCards = resume ? cardsFact(resume) : null;

  return (
    <div className="dh">
      <ExportDeckModal deck={exportModalDeck} onClose={() => setExportModalDeck(null)} notify={notify} />

      <KeptDecks kept={kept} onRetry={onRetryKept} onDiscard={onDiscardKept} />

      {toCopy > 0 && (
        <div className="dh-notice" role="status">
          <span className="dh-notice-text">
            {toCopy === 1 ? "1 deck is" : `${toCopy} decks are`} saved in this browser and not in your account.
          </span>
          <button className="primary" onClick={onCopyToAccount} disabled={copying}>
            {copying ? "Copying…" : "Copy to my account"}
          </button>
        </div>
      )}

      {decks.length === 0 && (
        <section className="dh-band">
          <img src={WELCOME_ART} alt="" className="dh-band-art" fetchPriority="high" />
          <div className="dh-band-body">
            <h1 className="dh-band-title">Build and tune Magic decks</h1>
            <p className="dh-band-facts">
              Start from a commander, from a description of how you like to play, or from a list you already have.
            </p>
            <div className="dh-band-actions">
              <NavLink href="/new" onNavigate={onNewDeck} className="btn-link">New deck</NavLink>
            </div>
          </div>
        </section>
      )}

      {resume && (
        <section className="dh-band" aria-labelledby="dh-resume">
          {resumeArt && <img src={resumeArt} alt="" className="dh-band-art" fetchPriority="high" />}
          <div className="dh-band-body">
            {resume.updated_at && <p className="dh-band-when">Edited {relativeTime(resume.updated_at)}</p>}
            <h1 className="dh-band-title" id="dh-resume">{resume.name || "Untitled deck"}</h1>
            <p className="dh-band-facts">
              <span>{formatLabel(resume)}</span>
              <span className={resumeCards.off ? "dh-off" : undefined}>{resumeCards.text}</span>
            </p>
            <div className="dh-band-actions">
              <NavLink href={deckHref(resume)} onNavigate={() => onOpen(resume)} className="btn-link">Open deck</NavLink>
              {onPlaytest && <button className="dh-band-ghost" onClick={() => onPlaytest(resume)}>Playtest</button>}
            </div>
          </div>
        </section>
      )}

      {decks.length > 0 && (
        <section className="dh-section">
          <div className="dh-head">
            <ListHeading className="dh-title">Your decks</ListHeading>
            <span className="dh-count">{decks.length} deck{decks.length !== 1 ? "s" : ""}</span>
          </div>

          {searchable && (
            <div className="mydecks-filterbar">
              <div className="mydecks-filter-group mydecks-filter-search">
                <label className="mydecks-filter-label" htmlFor="dh-search">Search</label>
                <div className="mydecks-filter-inputwrap">
                  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
                  <input id="dh-search" type="search" autoComplete="off" value={deckSearch} onChange={(e) => setDeckSearch(e.target.value)}
                    placeholder="Search decks…" className="mydecks-filter-input" />
                </div>
              </div>
              <div className="mydecks-filter-group">
                <label className="mydecks-filter-label" htmlFor="dh-format">Format</label>
                <select id="dh-format" value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="mydecks-filter-select">
                  <option value="all">All</option>
                  {FORMATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
              <div className="mydecks-filter-group">
                <label className="mydecks-filter-label" htmlFor="dh-sort">Sort by</label>
                <select id="dh-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="mydecks-filter-select">
                  <option value="updated">Updated</option>
                  <option value="name">Name</option>
                  <option value="format">Format</option>
                </select>
              </div>
              <div className="mydecks-filter-group">
                <span className="mydecks-filter-label">&nbsp;</span>
                <button className="mydecks-filter-dir" onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
                  aria-label={sortDir === "asc" ? "Sort descending" : "Sort ascending"}>
                  {sortDir === "asc" ? "↑" : "↓"}
                </button>
              </div>
            </div>
          )}

          {/* Anonymous users with real collections risk losing them with the
              browser's data; one-time banner, dismissal persists. */}
          {showSyncNudge && (
            <div className="dh-notice">
              <span className="dh-notice-text">
                {decks.length} decks are saved only in this browser. Sign in to copy them to an account you can open anywhere.
              </span>
              <span className="dh-notice-actions">
                <button className="primary" onClick={onOpenAccount}>Sign in</button>
                <button className="dh-notice-x" aria-label="Dismiss sign-in reminder" onClick={dismissSyncNudge}>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                </button>
              </span>
            </div>
          )}

          <div className="hero-grid">
            {sorted.map((d) => (
              <DeckTile
                key={d.id}
                deck={d}
                meta={deckMeta[d.id]}
                onOpen={onOpen}
                onPlaytest={onPlaytest}
                onDelete={onDelete}
                onRename={rename}
                onClone={clone}
                onExport={setExportModalDeck}
              />
            ))}
          </div>
          {searchable && sorted.length === 0 && <p className="muted">No decks match.</p>}
        </section>
      )}

      <section className="dh-section" aria-labelledby="dh-start">
        <div className="dh-head dh-head-spread">
          <h2 className="dh-title" id="dh-start">Start from a commander</h2>
          <NavLink href="/commanders" onNavigate={() => setTab("commanders")} className="dh-more">Browse all</NavLink>
        </div>
        <div className="teaser-row">
          {TEASER_COMMANDERS.map((e) => <TeaserTile key={e.slug} entry={e} onOpen={onOpenCommander} />)}
        </div>
      </section>
    </div>
  );
}
