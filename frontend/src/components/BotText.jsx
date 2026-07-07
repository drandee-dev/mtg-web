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

// Block-level markdown: headings, horizontal rules, blockquotes, bullet/numbered
// lists, and paragraphs. `className` lets a caller keep its own scope (defaults
// to the Planeswalker `pw-text` styling). Consecutive quote/list lines group
// into one block; everything else is a paragraph.
export function BotText({ text, actions, className = "pw-text" }) {
  const blocks = [];
  let list = null;  // { type: "list", ordered, items }
  let quote = null; // { type: "quote", lines }
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  const flushQuote = () => { if (quote) { blocks.push(quote); quote = null; } };
  const flush = () => { flushList(); flushQuote(); };

  for (const raw of (text || "").split("\n")) {
    const line = raw.trimEnd();

    // Horizontal rule: a line of only ---, ***, or ___ (3+). Checked before
    // lists so `***` isn't mistaken for a bullet.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: "hr" });
      continue;
    }
    // ATX heading: # … ###### followed by a space and text.
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    // Blockquote: `> text`, grouped across consecutive lines.
    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) {
      flushList();
      if (!quote) quote = { type: "quote", lines: [] };
      quote.lines.push(bq[1]);
      continue;
    }
    // Bullet / numbered lists.
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)/);
    if (bullet || ordered) {
      flushQuote();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) { flushList(); list = { type: "list", ordered: isOrdered, items: [] }; }
      list.items.push((bullet || ordered)[1]);
      continue;
    }
    // Paragraph (or a blank line, which renders as nothing).
    flush();
    blocks.push({ type: "para", text: line });
  }
  flush();

  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.type === "hr") return <hr key={i} className="pw-hr" />;
        if (b.type === "heading") {
          return (
            <div key={i} className={`pw-heading pw-h${b.level}`}>
              {renderInline(b.text, actions, `h${i}`)}
            </div>
          );
        }
        if (b.type === "quote") {
          return (
            <blockquote key={i} className="pw-quote">
              {b.lines.map((ln, j) =>
                ln.trim() ? <p key={j}>{renderInline(ln, actions, `q${i}-${j}`)}</p> : null
              )}
            </blockquote>
          );
        }
        if (b.type === "list") {
          const Tag = b.ordered ? "ol" : "ul";
          return (
            <Tag key={i}>
              {b.items.map((item, j) => <li key={j}>{renderInline(item, actions, `l${i}-${j}`)}</li>)}
            </Tag>
          );
        }
        if (!b.text.trim()) return null;
        return <p key={i}>{renderInline(b.text, actions, `l${i}`)}</p>;
      })}
    </div>
  );
}
