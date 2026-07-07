// Shared renderer for AI bot answers (Planeswalker chat + Rules Q&A).
// The models emit lightweight markdown — paragraphs, bullet/numbered lists,
// **bold**, `code`, and [[Card Name]] mentions. This turns that into real
// nodes so multi-step answers (sequences, layer walk-throughs) render with
// structure instead of literal asterisks. Kept deliberately small — it is not
// a full markdown engine, only the subset the bots actually produce.

// [[Card Name]] → tappable chip with add/consider actions (actions optional).
function CardChip({ name, onAdd, onConsider, notify }) {
  if (!onAdd && !onConsider) return <span className="pw-cardname">{name}</span>;
  return (
    <span className="pw-cardchip">
      <span className="pw-cardchip-name">{name}</span>
      {onAdd && (
        <button
          className="pw-cardchip-btn"
          aria-label={`Add ${name} to deck`}
          title="Add to deck"
          onClick={() => { onAdd(name); notify?.(`Added ${name}`); }}
        >+</button>
      )}
      {onConsider && (
        <button
          className="pw-cardchip-btn"
          aria-label={`Add ${name} to Considering`}
          title="Add to Considering"
          onClick={() => { onConsider(name); notify?.(`${name} → Considering`); }}
        >☆</button>
      )}
    </span>
  );
}

// Inline markdown: [[Card]], **bold**, `code`. Returns an array of nodes.
function renderInline(text, actions, keyBase) {
  const out = [];
  const re = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] != null) {
      out.push(<CardChip key={`${keyBase}-c${i}`} name={m[1].trim()} {...actions} />);
    } else if (m[2] != null) {
      out.push(<strong key={`${keyBase}-b${i}`}>{renderInline(m[2], actions, `${keyBase}-b${i}`)}</strong>);
    } else {
      out.push(<code key={`${keyBase}-k${i}`}>{m[3]}</code>);
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Block-level markdown: paragraphs + bullet/numbered lists. `className` lets a
// caller keep its own scope (defaults to the Planeswalker `pw-text` styling).
export function BotText({ text, actions, className = "pw-text" }) {
  const blocks = [];
  let list = null; // { ordered, items }
  const flush = () => { if (list) { blocks.push(list); list = null; } };
  for (const raw of (text || "").split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)/);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) { flush(); list = { ordered: isOrdered, items: [] }; }
      list.items.push((bullet || ordered)[1]);
    } else {
      flush();
      blocks.push(line);
    }
  }
  flush();
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (typeof b === "string") {
          if (!b.trim()) return null;
          return <p key={i}>{renderInline(b, actions, `l${i}`)}</p>;
        }
        const Tag = b.ordered ? "ol" : "ul";
        return (
          <Tag key={i}>
            {b.items.map((item, j) => <li key={j}>{renderInline(item, actions, `l${i}-${j}`)}</li>)}
          </Tag>
        );
      })}
    </div>
  );
}
