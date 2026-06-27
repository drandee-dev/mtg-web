import { useEffect, useState, useCallback } from "react";
import { getCardImage } from "../../lib/api";
import { parseDeckText, groupCards } from "../../lib/deckParser";
import { canHover } from "../../lib/hooks";
import CardThumbnail from "./CardThumbnail";
import StackView from "./StackView";
import CardListRow from "./CardListRow";
import CardBottomSheet from "./CardBottomSheet";
import ViewToggle from "./ViewToggle";
import CardPreview from "../CardPreview";


const SORTS = [
  { id: "name", label: "Name" },
  { id: "cmc", label: "Mana value" },
  { id: "price", label: "Price" },
];

const GROUPS = [
  { id: "type", label: "Type" },
  { id: "role", label: "Role" },
  { id: "cmc", label: "Mana value" },
  { id: "color", label: "Color" },
  { id: "rarity", label: "Rarity" },
  { id: "price", label: "Price range" },
];

function deckCompleteness(totalCards, commander, format) {
  const isCmdr = format === "commander" || format === "paupercommander";
  if (isCmdr) {
    const cmdrCount = commander ? commander.split(" && ").filter(Boolean).length : 0;
    const total = totalCards + cmdrCount;
    const status = total > 100 ? "bad" : total === 100 ? "good" : "warn";
    return { label: `${total} / 100`, status, title: "Commander decks are exactly 100 cards" };
  }
  const status = totalCards >= 60 ? "good" : "warn";
  return { label: `${totalCards} / 60+`, status, title: "Constructed decks are a 60-card minimum" };
}

export default function CardGrid({ decklist, commander, format, filter, typeFilter, onRemove, onConsider, onTypeCounts, notify }) {
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem("mtgweb:viewMode") || "grid"
  );
  const [sortBy, setSortBy] = useState(
    () => localStorage.getItem("mtgweb:sortBy") || "name"
  );
  const [groupBy, setGroupBy] = useState(
    () => localStorage.getItem("mtgweb:groupBy") || "type"
  );
  const [metaMap, setMetaMap] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [previewCard, setPreviewCard] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mtgweb:collapsed") || "[]")); }
    catch { return new Set(); }
  });

  const { cards, totalCards } = parseDeckText(decklist);

  useEffect(() => {
    localStorage.setItem("mtgweb:viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("mtgweb:sortBy", sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem("mtgweb:groupBy", groupBy);
  }, [groupBy]);

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
    const names = [...new Set(cards.map((c) => c.name))];
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
  }, [decklist]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (!onTypeCounts || Object.keys(metaMap).length === 0) return;
    const counts = { all: totalCards };
    for (const card of cards) {
      const tl = (metaMap[card.name]?.type_line || "").toLowerCase();
      for (const type of ["creature", "instant", "sorcery", "artifact", "enchantment", "land"]) {
        if (tl.includes(type)) { counts[type] = (counts[type] || 0) + card.qty; break; }
      }
    }
    onTypeCounts(counts);
  }, [metaMap, cards, totalCards]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredCards = cards.filter((c) => {
    if (filter && !c.name.toLowerCase().includes(filter.toLowerCase())) return false;
    if (typeFilter && typeFilter !== "all") {
      const tl = (metaMap[c.name]?.type_line || "").toLowerCase();
      if (!tl.includes(typeFilter)) return false;
    }
    return true;
  });

  const rawGroups = Object.keys(metaMap).length > 0
    ? groupCards(filteredCards, groupBy, metaMap)
    : filteredCards.length > 0
      ? { "All Cards": filteredCards }
      : {};
  const groups = Object.fromEntries(
    Object.entries(rawGroups).map(([type, list]) => [type, sortCards(list)])
  );

  const handlePreview = useCallback((name) => setPreviewCard(name), []);
  const closePreview = useCallback(() => setPreviewCard(null), []);

  // Touch: first tap expands, second tap opens preview
  const handleThumbnailExpand = useCallback((cardName) => {
    if (canHover) {
      setPreviewCard(cardName);
    } else {
      if (expandedId === cardName) {
        setPreviewCard(cardName);
        setExpandedId(null);
      } else {
        setExpandedId(cardName);
      }
    }
  }, [expandedId]);

  const groupTotal = (cards) => cards.reduce((s, c) => s + c.qty, 0);

  return (
    <div className="card-grid-container">
      <div className="cg-toolbar">
        {(() => {
          const c = deckCompleteness(totalCards, commander, format);
          return <span className={`badge ${c.status}`} title={c.title}>{c.label}</span>;
        })()}
        <div className="cg-toolbar-controls">
          <div className="cg-tb-group">
            <span className="cg-tb-label">View as</span>
            <ViewToggle mode={viewMode} setMode={setViewMode} />
          </div>
          <div className="cg-tb-group">
            <span className="cg-tb-label">Group by</span>
            <select
              className="sort-select"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              aria-label="Group cards by"
            >
              {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
          <div className="cg-tb-group">
            <span className="cg-tb-label">Sort by</span>
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort cards"
            >
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Stack view: Archidekt-style overlapping columns */}
      {viewMode === "stack" && (
        <StackView groups={Object.entries(groups)} onCardClick={handleThumbnailExpand} onRemove={onRemove} onConsider={onConsider} />
      )}

      {/* Grid and List views: groups stacked vertically */}
      {viewMode !== "stack" && Object.entries(groups).map(([type, groupCards]) => (
        <div key={type} className="card-group">
          <button className="group-header" onClick={() => toggleCollapse(type)} aria-expanded={!collapsed.has(type)}>
            <span className={`group-chevron ${collapsed.has(type) ? "closed" : ""}`}>▾</span>
            <h3>{type}</h3>
            <span className="count">({groupTotal(groupCards)})</span>
          </button>

          {!collapsed.has(type) && viewMode === "grid" && (
            <div className="card-grid" role="list">
              {groupCards.map((c) => (
                <CardThumbnail
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  onRemove={onRemove}
                  onConsider={onConsider}
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

      {totalCards === 0 && (
        <p className="muted" style={{ textAlign: "center", padding: "2rem 0" }}>
          No cards yet — use the search bar above to add cards, or paste a decklist.
        </p>
      )}

      {/* Full-size card preview: bottom sheet on touch, modal on desktop */}
      {previewCard && !canHover && (
        <CardBottomSheet
          name={previewCard}
          onClose={closePreview}
          onRemove={onRemove}
          onAddToConsidering={onConsider}
        />
      )}
      {previewCard && canHover && (
        <div className="card-modal" onClick={closePreview} role="dialog" aria-modal="true" aria-label={previewCard}>
          <CardPreviewModal name={previewCard} />
        </div>
      )}
    </div>
  );
}

function CardPreviewModal({ name }) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    getCardImage(name).then((d) => setImg(d?.image || null));
  }, [name]);
  if (!img) return <div className="card-modal-empty">Loading…</div>;
  return <img src={img} alt={name} width="488" height="680" loading="lazy" />;
}
