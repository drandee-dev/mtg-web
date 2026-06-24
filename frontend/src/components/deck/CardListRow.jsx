import { useCardImage } from "../../lib/hooks";

export default function CardListRow({ name, qty, typeLine, price, isMdfc, onRemove, onPreview }) {
  const data = useCardImage(name);
  const thumb = data?.thumb || null;

  return (
    <div className="card-list-row" role="listitem">
      <span className="card-list-qty">{qty}</span>
      {thumb ? (
        <img
          className="card-list-thumb"
          src={thumb}
          alt=""
          width="32"
          height="45"
          loading="lazy"
          onClick={() => onPreview?.(name)}
          style={{ cursor: "pointer", borderRadius: "3px" }}
        />
      ) : (
        <span className="card-list-thumb-empty" />
      )}
      <button className="card-list-name" onClick={() => onPreview?.(name)}>
        {name}
      </button>
      <span className="card-list-type muted small truncate">
        {typeLine || ""}
        {isMdfc && <span className="mdfc-tag" title="Modal double-faced card">MDFC</span>}
      </span>
      <span className="card-list-price muted small">
        {price != null ? `$${Number(price).toFixed(2)}` : ""}
      </span>
      {onRemove && (
        <button
          className="card-list-remove ghost small"
          onClick={() => onRemove(name)}
          aria-label={`Remove ${name}`}
        >
          ✕
        </button>
      )}
    </div>
  );
}
