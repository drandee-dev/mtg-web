import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { getCardImage } from "../../lib/api";
import { parseDeckText, groupCards, mdfcLandCount, splitCommanders } from "../../lib/deckParser";
import { parseDeckFilter, cardMatchesFilter } from "../../lib/deckFilter";
import { useCanHover } from "../../lib/hooks";
// canHover gates desktop-only drag affordances; touch uses the ⋯ menus instead.
import CardThumbnail from "./CardThumbnail";
import StackView from "./StackView";
import TextStackView from "./TextStackView";
import DeckSkeleton from "./DeckSkeleton";
import CardListRow from "./CardListRow";
import CardDetailModal from "./CardDetailModal";

// True when focus is on a stack card, row or column header: a move made from there came from
// a menu (a mouse drag leaves focus on the page).
const focusWasInStack = () => Boolean(document.activeElement?.closest?.("[data-card-name], [data-column]"));

// The view settings (viewMode, stackMode, sortBy, groupBy) come from DeckView's
// useCardView; the toolbar that sets them is on the deck's tab strip (job 3.3).
export default function CardGrid({ decklist, commander, format, deckId, filter, viewMode, stackMode, sortBy, groupBy, onRemove, onConsider, onChangeCommander, onMakeCommander, setCardQty, onSetPrinting, onSetCommanderPrinting, maybeboard, onMoveFromConsidering, onRemoveConsidering, onSuggestConsiderations, suggesting }) {
  const canHover = useCanHover();
  const [metaMap, setMetaMap] = useState({});
  // Per-groupBy column order overrides: { [groupBy]: [label, …] }. Reordering a
  // column persists only for the mode it was reordered in.
  const [columnOrder, setColumnOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mtgweb:colOrder") || "{}"); }
    catch { return {}; }
  });
  // Per-deck category overrides (role mode only): { [cardName]: bucketLabel }.
  // Keyed by deck id so a card moved in one deck doesn't move in another. Unsaved
  // decks share the "current" bucket until first save. Read from localStorage via
  // useMemo (bumping catVersion forces a re-read after a write).
  const catKey = `mtgweb:cat:${deckId || "current"}`;
  const [catVersion, setCatVersion] = useState(0);
  const categoryOverrides = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(catKey) || "{}"); }
    catch { return {}; }
    // catVersion is an intentional cache-bust: it forces a re-read after a write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catKey, catVersion]);
  const [previewCard, setPreviewCard] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mtgweb:collapsed") || "[]")); }
    catch { return new Set(); }
  });

  const { cards, totalCards } = parseDeckText(decklist);

  // Commander(s) render as a fixed, crowned leading column — they live outside the
  // decklist text, so they're injected here rather than grouped from `cards`.
  const isCmdrFmt = format === "commander" || format === "paupercommander";
  // Commanders may carry a pinned printing suffix — split into clean name +
  // printing so image lookups use the clean name and the pinned art shows.
  const commanderEntries = isCmdrFmt ? splitCommanders(commander) : [];
  const commanderNames = commanderEntries.map((c) => c.name);
  const commanderCards = commanderEntries.map((c) => ({ name: c.name, qty: 1, printing: c.printing }));

  // Considering (sideboard/maybeboard) — a fixed trailing column, Archidekt-style:
  // never part of the maindeck, never regrouped, never counted in totals.
  const consideringCards = parseDeckText(maybeboard || "").cards;
  const consideringNames = consideringCards.map((c) => c.name);
  const consideringMenu = onSuggestConsiderations
    ? [{ label: suggesting ? "Suggesting…" : "Suggest cards to consider", icon: "✨", onClick: onSuggestConsiderations }]
    : null;

  useEffect(() => {
    localStorage.setItem("mtgweb:colOrder", JSON.stringify(columnOrder));
  }, [columnOrder]);

  const toggleCollapse = useCallback((type) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      localStorage.setItem("mtgweb:collapsed", JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Resolve full card metadata (type, roles, cmc, color, price) for all cards
  useEffect(() => {
    const names = [...new Set([...cards.map((c) => c.name), ...commanderNames, ...consideringNames])];
    let cancelled = false;
    Promise.all(
      names.map(async (name) => {
        const d = await getCardImage(name);
        return [name, d];
      })
    ).then((entries) => {
      if (cancelled) return;
      const meta = {};
      for (const [name, d] of entries) {
        meta[name] = {
          type_line: d?.type_line || "",
          mana_cost: d?.mana_cost || "",
          roles: d?.roles || [],
          cmc: d?.cmc ?? 0,
          color_identity: d?.color_identity || [],
          price_usd: d?.price_usd ?? null,
          rarity: d?.rarity || "common",
          is_mdfc: d?.is_mdfc || false,
        };
      }
      setMetaMap(meta);
    });
    return () => { cancelled = true; };
  }, [decklist, commander, maybeboard]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortCards = useCallback((list) => {
    const sorted = [...list];
    if (sortBy === "cmc") {
      sorted.sort((a, b) => (metaMap[a.name]?.cmc ?? 0) - (metaMap[b.name]?.cmc ?? 0) || a.name.localeCompare(b.name));
    } else if (sortBy === "price") {
      sorted.sort((a, b) => (metaMap[b.name]?.price_usd ?? 0) - (metaMap[a.name]?.price_usd ?? 0) || a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [sortBy, metaMap]);

  // Filter syntax (name substring, t:, mv:, c:, usd:) — documented by the
  // Filter "?" popover; matched against metaMap client-side.
  const filterTerms = useMemo(() => parseDeckFilter(filter), [filter]);
  const filteredCards = filterTerms.length === 0
    ? cards
    : cards.filter((c) => cardMatchesFilter(c.name, metaMap[c.name], filterTerms));

  // Until the card data is in, no card can be put in its column. Drawing them all
  // in one "All Cards" column and moving them later was most of the page's layout
  // shift on opening a deck, so that wait shows the empty columns instead.
  const awaitingMeta = Object.keys(metaMap).length === 0 && filteredCards.length > 0;
  const rawGroups = awaitingMeta
    ? {}
    : groupCards(filteredCards, groupBy, metaMap);

  // Card moves between columns are only meaningful for Role grouping — Type, Color,
  // CMC, etc. are computed truths, so dragging a card there has nothing to persist.
  const cardDragEnabled = groupBy === "role";

  // Relocate cards that have a per-deck override to their chosen column.
  const overriddenGroups = (() => {
    if (!cardDragEnabled || Object.keys(categoryOverrides).length === 0) return rawGroups;
    const present = new Set(filteredCards.map((c) => c.name));
    const next = {};
    for (const [bucket, list] of Object.entries(rawGroups)) {
      const kept = list.filter((c) => !categoryOverrides[c.name]);
      if (kept.length) next[bucket] = kept;
    }
    const placed = new Set(); // guard against a multi-role card being added twice
    for (const list of Object.values(rawGroups)) {
      for (const c of list) {
        const target = categoryOverrides[c.name];
        if (target && present.has(c.name) && !placed.has(c.name)) {
          (next[target] ??= []).push(c);
          placed.add(c.name);
        }
      }
    }
    return next;
  })();

  // Apply the user's saved column order for this grouping; new columns append in
  // groupCards' natural order.
  const savedOrder = columnOrder[groupBy] || [];
  const orderedLabels = [
    ...savedOrder.filter((l) => overriddenGroups[l]),
    ...Object.keys(overriddenGroups).filter((l) => !savedOrder.includes(l)),
  ];
  const groups = Object.fromEntries(
    orderedLabels.map((label) => [label, sortCards(overriddenGroups[label])])
  );

  // Expose the current displayed column order to the reorder handler without
  // re-deriving it inside a setter. Updated in an effect (not during render) so the
  // ref is fresh for the next drag event.
  const displayLabelsRef = useRef([]);
  useEffect(() => { displayLabelsRef.current = orderedLabels; });

  // A move made from a menu re-renders the card (or column) somewhere else, and the menu
  // button that had focus is gone. Say what happened, then put focus back on the same
  // thing's menu. A drag has no focus to restore, so it only announces.
  const [announcement, setAnnouncement] = useState("");
  const [refocus, setRefocus] = useState(null);
  useEffect(() => {
    if (!refocus) return undefined;
    // The masonry re-splits the columns a few frames after the state change, and the node
    // that held focus is replaced when it does. Keep trying until focus has stuck.
    let id;
    let tries = 0;
    const attempt = () => {
      const holder = refocus.card
        ? [...document.querySelectorAll("[data-card-name]")].find((n) => n.dataset.cardName === refocus.card)
        : [...document.querySelectorAll("[data-column]")].find((n) => n.dataset.column === refocus.column);
      // The user Tabbed somewhere else mid-retry: leave their focus alone.
      const now = document.activeElement;
      if (tries > 0 && holder && now && now !== document.body && !holder.contains(now)) { setRefocus(null); return; }
      const btn = holder?.querySelector(refocus.card ? '.more-menu-btn[aria-label^="Move "]' : '.more-menu-btn[aria-label^="Reorder "]');
      // A text row hides its actions (display: none) until the row itself has focus, and a
      // hidden button cannot take it: focus the row first, which shows them.
      if (refocus.card) holder?.focus({ preventScroll: true });
      btn?.focus();
      if ((btn && document.activeElement === btn) || ++tries > 30) setRefocus(null);
      else id = requestAnimationFrame(attempt);
    };
    id = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(id);
  }, [refocus, columnOrder, catVersion]);

  const handleCardMove = useCallback((cardName, targetBucket) => {
    if (groupBy !== "role") return;
    const fromMenu = focusWasInStack();
    let next;
    try { next = JSON.parse(localStorage.getItem(catKey) || "{}"); } catch { next = {}; }
    next[cardName] = targetBucket;
    localStorage.setItem(catKey, JSON.stringify(next));
    setCatVersion((v) => v + 1);
    setAnnouncement(`Moved ${cardName} to ${targetBucket}`);
    if (fromMenu) setRefocus({ card: cardName });
  }, [groupBy, catKey]);

  const handleColumnReorder = useCallback((fromLabel, toLabel) => {
    setColumnOrder((prev) => {
      const base = (prev[groupBy] && prev[groupBy].length) ? prev[groupBy] : displayLabelsRef.current;
      const arr = base.filter((l) => l !== fromLabel);
      const idx = arr.indexOf(toLabel);
      if (idx === -1) arr.push(fromLabel);
      else arr.splice(idx, 0, fromLabel);
      return { ...prev, [groupBy]: arr };
    });
  }, [groupBy]);

  // Touch fallback for column reorder: nudge a column one slot left (-1) or right (+1).
  const handleColumnNudge = useCallback((label, dir) => {
    const at = displayLabelsRef.current.indexOf(label);
    const to = at + dir;
    if (at >= 0 && to >= 0 && to < displayLabelsRef.current.length) {
      setAnnouncement(`Moved ${label} ${dir < 0 ? "left" : "right"}, now column ${to + 1} of ${displayLabelsRef.current.length}`);
      setRefocus({ column: label });
    }
    setColumnOrder((prev) => {
      const base = (prev[groupBy] && prev[groupBy].length) ? [...prev[groupBy]] : [...displayLabelsRef.current];
      for (const l of displayLabelsRef.current) if (!base.includes(l)) base.push(l);
      const i = base.indexOf(label);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= base.length) return prev;
      [base[i], base[j]] = [base[j], base[i]];
      return { ...prev, [groupBy]: base };
    });
  }, [groupBy]);

  const handlePreview = useCallback((name) => setPreviewCard(name), []);
  const closePreview = useCallback(() => setPreviewCard(null), []);

  // One tap opens the preview in every view. Image stacks keep their own
  // tap-to-reveal step (overlapped cards) inside StackView; adding another here
  // made Stacks take four taps and left Grid with a first tap that did nothing.
  const handleThumbnailExpand = handlePreview;

  const groupTotal = (cards) => cards.reduce((s, c) => s + c.qty, 0);

  // "+N w/MDFC" hint on land group headers: cards filed elsewhere whose back
  // face is a land still tap for mana (Archidekt-style).
  const mdfcLands = mdfcLandCount(cards, metaMap);
  const landSuffix = (label) =>
    mdfcLands > 0 && (label === "Land" || label === "Lands") ? `+${mdfcLands} w/MDFC` : null;

  return (
    <div className="card-grid-container">
      <div className="visually-hidden stack-announce" role="status" aria-live="polite">{announcement}</div>
      {/* Deck working area — contained board, visually separated from the toolbar above */}
      <div className="deck-board">
      {/* Stack view: Archidekt-style columns — image (overlapping art) or text rows */}
      {viewMode === "stack" && (
        <>
          {cardDragEnabled && canHover && (
            <p className="stack-drag-hint">Drag cards between columns to recategorize · drag a column header to reorder</p>
          )}
          {awaitingMeta ? (
            <DeckSkeleton viewMode="stack" stackMode={stackMode} count={filteredCards.length} commanders={commanderCards} />
          ) : stackMode === "text" ? (
            <TextStackView
              groups={Object.entries(groups)}
              metaMap={metaMap}
              onCardClick={handleThumbnailExpand}
              onRemove={onRemove}
              onConsider={onConsider}
              cardDragEnabled={cardDragEnabled}
              onColumnReorder={handleColumnReorder}
              onColumnNudge={handleColumnNudge}
              onCardMove={handleCardMove}
              commanderColumn={commanderCards}
              onChangeCommander={onChangeCommander}
              consideringColumn={consideringCards}
              consideringMenu={consideringMenu}
              landSuffix={landSuffix}
            />
          ) : (
            <StackView
              groups={Object.entries(groups)}
              metaMap={metaMap}
              onCardClick={handleThumbnailExpand}
              onRemove={onRemove}
              onConsider={onConsider}
              cardDragEnabled={cardDragEnabled}
              onColumnReorder={handleColumnReorder}
              onColumnNudge={handleColumnNudge}
              onCardMove={handleCardMove}
              onSetQty={setCardQty}
              commanderColumn={commanderCards}
              onChangeCommander={onChangeCommander}
              consideringColumn={consideringCards}
              consideringMenu={consideringMenu}
              landSuffix={landSuffix}
            />
          )}
        </>
      )}

      {/* Grid and List views: commander leads, then groups stacked vertically */}
      {viewMode !== "stack" && commanderCards.length > 0 && (
        <div className="card-group">
          <div className="group-header" style={{ cursor: "default" }}>
            <span className="stack-column-crown" aria-hidden="true">♛</span>
            <h3>Commander</h3>
            <span className="count">({commanderCards.length})</span>
          </div>
          {viewMode === "grid" ? (
            <div className="card-grid" role="list">
              {commanderCards.map((c) => (
                <CardThumbnail
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  printing={c.printing}
                  onRemove={null}
                  onConsider={null}
                  onSetQty={null}
                  onExpand={() => handleThumbnailExpand(c.name)}
                  useArtCrop={!canHover}
                />
              ))}
            </div>
          ) : (
            <div className="card-list" role="list">
              {commanderCards.map((c) => (
                <CardListRow
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  typeLine={metaMap[c.name]?.type_line}
                  price={metaMap[c.name]?.price_usd}
                  isMdfc={metaMap[c.name]?.is_mdfc}
                  onRemove={null}
                  onPreview={handlePreview}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {viewMode !== "stack" && awaitingMeta && (
        <DeckSkeleton viewMode={viewMode} count={filteredCards.length} />
      )}
      {viewMode !== "stack" && Object.entries(groups).map(([type, groupCards]) => (
        <div key={type} className="card-group">
          <button className="group-header" onClick={() => toggleCollapse(type)} aria-expanded={!collapsed.has(type)}>
            <span className={`group-chevron ${collapsed.has(type) ? "closed" : ""}`}>▾</span>
            <h3>{type}</h3>
            <span className="count">({groupTotal(groupCards)})</span>
            {landSuffix(type) && <span className="count mdfc-hint" title="Cards whose back face is a land">{landSuffix(type)}</span>}
          </button>

          {!collapsed.has(type) && viewMode === "grid" && (
            <div className="card-grid" role="list">
              {groupCards.map((c) => (
                <CardThumbnail
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  printing={c.printing}
                  onRemove={onRemove}
                  onConsider={onConsider}
                  onSetQty={setCardQty}
                  onExpand={() => handleThumbnailExpand(c.name)}
                  useArtCrop={!canHover}
                />
              ))}
            </div>
          )}

          {!collapsed.has(type) && viewMode === "list" && (
            <div className="card-list" role="list">
              {groupCards.map((c) => (
                <CardListRow
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  typeLine={metaMap[c.name]?.type_line}
                  price={metaMap[c.name]?.price_usd}
                  isMdfc={metaMap[c.name]?.is_mdfc}
                  onRemove={onRemove}
                  onPreview={handlePreview}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Considering — fixed trailing group in grid/list (stack views render it
          as a pinned column). Never part of the maindeck or its counts. */}
      {viewMode !== "stack" && consideringCards.length > 0 && (
        <div className="card-group considering-group">
          <div className="group-header" style={{ cursor: "default" }}>
            <span className="considering-star" aria-hidden="true">☆</span>
            <h3>Considering</h3>
            <span className="count">({groupTotal(consideringCards)})</span>
            <span className="count considering-note">not in deck</span>
          </div>
          {viewMode === "grid" ? (
            <div className="card-grid" role="list">
              {consideringCards.map((c) => (
                <CardThumbnail
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  onRemove={onRemoveConsidering}
                  onConsider={null}
                  onSetQty={null}
                  onExpand={() => handleThumbnailExpand(c.name)}
                  useArtCrop={!canHover}
                />
              ))}
            </div>
          ) : (
            <div className="card-list" role="list">
              {consideringCards.map((c) => (
                <CardListRow
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  typeLine={metaMap[c.name]?.type_line}
                  price={metaMap[c.name]?.price_usd}
                  isMdfc={metaMap[c.name]?.is_mdfc}
                  onRemove={onRemoveConsidering}
                  onPreview={handlePreview}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Considering zero-state — the column only exists once it has cards, so
          give the feature an entry point: AI seeds the first few candidates.
          Not view-mode-gated: stack view has no analogous empty-column
          affordance (StackView only renders a Considering column when it has
          cards), so this CTA is the only entry point there too. */}
      {consideringCards.length === 0 && totalCards > 0 && onSuggestConsiderations && (
        <div className="considering-zero">
          <span className="considering-star" aria-hidden="true">☆</span>
          <span className="considering-zero-text">
            <strong>Considering</strong> — park cards you're not sure about, Archidekt-style.
          </span>
          <button className="ghost small" disabled={suggesting} onClick={onSuggestConsiderations}>
            {suggesting ? "Suggesting…" : "✨ Suggest cards"}
          </button>
        </div>
      )}

      {totalCards === 0 && (
        <p className="muted" style={{ textAlign: "center", padding: "2rem 0" }}>
          No cards yet. Add one with "Add a card by name" above, or bring in a list with Import cards in More.
        </p>
      )}

      </div>{/* /.deck-board */}

      {/* Card detail modal — centered on desktop, bottom sheet on mobile (CSS) */}
      {previewCard && (() => {
        const isCmdr = commanderNames.includes(previewCard);
        const isConsidering = !isCmdr
          && consideringNames.includes(previewCard)
          && !cards.some((c) => c.name === previewCard);
        const currentCategory = cardDragEnabled && !isConsidering
          ? (Object.entries(groups).find(([, list]) => list.some((c) => c.name === previewCard))?.[0] || null)
          : null;
        const cmdrPrinting = isCmdr
          ? (commanderCards.find((c) => c.name === previewCard)?.printing || null)
          : null;
        return (
          <CardDetailModal
            name={previewCard}
            qty={isConsidering
              ? (consideringCards.find((c) => c.name === previewCard)?.qty ?? 1)
              : (cards.find((c) => c.name === previewCard)?.qty ?? 1)}
            printing={isCmdr ? cmdrPrinting : (cards.find((c) => c.name === previewCard)?.printing || null)}
            onSetPrinting={
              isConsidering ? null
                : isCmdr ? (onSetCommanderPrinting ? (_n, p) => onSetCommanderPrinting(previewCard, p) : null)
                : onSetPrinting
            }
            isCommander={isCmdr}
            isConsidering={isConsidering}
            onAddToDeck={isConsidering ? onMoveFromConsidering : null}
            onClose={closePreview}
            onRemove={isCmdr ? null : (isConsidering ? onRemoveConsidering : onRemove)}
            onConsider={isCmdr || isConsidering ? null : onConsider}
            onSetQty={isCmdr || isConsidering ? null : setCardQty}
            categories={cardDragEnabled && !isConsidering ? Object.keys(groups) : null}
            currentCategory={currentCategory}
            onMove={handleCardMove}
            onChangeCommander={isCmdr ? onChangeCommander : null}
            onMakeCommander={!isCmdr && !isConsidering ? onMakeCommander : null}
            commander={commander}
            decklist={decklist}
            format={format}
          />
        );
      })()}
    </div>
  );
}
