import { useColumnCount, packMasonry } from "../../lib/masonry";
import { useCanHover } from "../../lib/hooks";
import CardPlaceholder from "../CardPlaceholder";

// What the deck's cards look like until their data arrives (visual pass job 6).
// The category of each card is not known before that data is, so the cards used
// to be drawn in one "All Cards" column and then moved into their real columns,
// which is most of the layout shift on opening a deck. This draws the columns
// at their final width, empty, and the cards go in once. The number of columns
// is a typical deck's: the real one is not known, so the page below can still
// move a little when the real columns land.
const CATEGORIES = 8;
// Same numbers as StackView's estimate: a header, one full card, a sliver per card after it.
const estimate = (n) => 34 + 335 + Math.max(0, n - 1) * 46;

function Header({ label }) {
  return (
    <div className="stack-column-header">
      {label ? <span className="stack-column-label">{label}</span> : <span className="ph ph-line ph-w-60 ph-flush" />}
    </div>
  );
}

function ImageColumn({ label, cards }) {
  return (
    <div className="stack-column stack-column-image">
      <Header label={label} />
      <div className="stack-cards">
        {cards.map((c, i) => (
          <div key={i} className="stack-card-wrap"><CardPlaceholder name={c?.name} /></div>
        ))}
      </div>
    </div>
  );
}

function TextColumn({ label, rows }) {
  return (
    <div className="stack-column stack-column-text">
      <Header label={label} />
      <div className="ts-rows">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="ts-row"><span className="ph ph-line ph-w-90 ph-flush" /></div>
        ))}
      </div>
    </div>
  );
}

function Stacks({ count, commanders, text }) {
  const canHover = useCanHover();
  const [ref, columnCount] = useColumnCount(text ? 14.5 : 15, 0.7);
  const k = Math.max(1, Math.min(CATEGORIES, count));
  const per = Math.max(1, Math.round(count / k));
  const items = [];
  if (commanders.length > 0) {
    items.push({
      key: "commander", estimatedHeight: estimate(commanders.length),
      node: text
        ? <TextColumn label="Commander" rows={commanders.length} />
        : <ImageColumn label="Commander" cards={commanders} />,
    });
  }
  for (let i = 0; i < k; i++) {
    items.push({
      key: i, estimatedHeight: estimate(per),
      node: text ? <TextColumn rows={per} /> : <ImageColumn cards={Array.from({ length: per })} />,
    });
  }
  const cols = Math.max(1, Math.min(columnCount, items.length));
  return (
    <div ref={ref} className={`stack-view${text ? " text-stack-view" : ""} ${canHover ? "" : "stack-touch"}`}>
      {packMasonry(items, cols).map((bucket, i) => (
        <div className="stack-masonry-col" key={i}>
          {bucket.map((item) => <div key={item.key}>{item.node}</div>)}
        </div>
      ))}
    </div>
  );
}

// Grid and List: the same groups, as headers over tiles or rows.
function Groups({ count, grid }) {
  const k = Math.max(1, Math.min(CATEGORIES, count));
  const per = Math.max(1, Math.round(count / k));
  return Array.from({ length: k }, (_, g) => (
    <div key={g} className="card-group">
      <div className="group-header"><span className="ph ph-line ph-w-30 ph-flush" /></div>
      {grid ? (
        <div className="card-grid">
          {Array.from({ length: per }, (_, i) => <div key={i} className="card-thumb"><CardPlaceholder /></div>)}
        </div>
      ) : (
        <div className="card-list">
          {Array.from({ length: per }, (_, i) => <div key={i} className="card-list-row"><span className="ph ph-line ph-w-60 ph-flush" style={{ gridColumn: "1 / -1" }} /></div>)}
        </div>
      )}
    </div>
  ));
}

export default function DeckSkeleton({ viewMode, stackMode, count, commanders = [] }) {
  return (
    <div className="deck-skeleton" aria-busy="true">
      <span className="visually-hidden" role="status">Loading cards…</span>
      <div aria-hidden="true">
        {viewMode === "stack"
          ? <Stacks count={count} commanders={commanders} text={stackMode === "text"} />
          : <Groups count={count} grid={viewMode === "grid"} />}
      </div>
    </div>
  );
}
