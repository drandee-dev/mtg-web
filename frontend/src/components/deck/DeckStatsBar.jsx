// Sticky aggregate stats bar, full-width dock pinned to the bottom of the
// viewport (Job 4, Round 3 tappeddecks redesign). Pure display surface over
// data already computed for DeckSidebar/AssessmentPanel/InsightsPanel — no
// new computation here. Each stat hides individually when its value is null,
// same convention as the existing header/commander-strip stats.
import { ManaIcon } from "./ManaCost";

const WUBRG = ["W", "U", "B", "R", "G"];

export default function DeckStatsBar({ result, commander, format }) {
  if (!result) return null;

  const isCmdr = format === "commander" || format === "paupercommander";
  const count = result.total_cards != null
    ? result.total_cards + (commander ? commander.split(" && ").filter(Boolean).length : 0)
    : null;
  const bracket = result?.bracket?.bracket;
  const price = result?.breakdown?.price_usd;
  const avgCmc = result?.stats?.avg_cmc;
  const pct = result?.mana?.pip_demand_pct || {};
  const colors = WUBRG.filter((c) => pct[c]);

  if (count == null && bracket == null && price == null && avgCmc == null && !colors.length) return null;

  return (
    <div className="deck-stats-bar" role="status" aria-label="Deck summary">
      {count != null && (
        <div className="dsb-stat">
          <span className="dsb-val">{isCmdr ? `${count}/100` : count}</span>
          <span className="dsb-label">Cards</span>
        </div>
      )}
      {bracket != null && (
        <div className="dsb-stat">
          <span className="dsb-val">B{bracket}</span>
          <span className="dsb-label">Bracket</span>
        </div>
      )}
      {price != null && (
        <div className="dsb-stat">
          <span className="dsb-val">${Math.round(price)}</span>
          <span className="dsb-label">Est. price</span>
        </div>
      )}
      {avgCmc != null && (
        <div className="dsb-stat">
          <span className="dsb-val">{avgCmc}</span>
          <span className="dsb-label">Avg CMC</span>
        </div>
      )}
      {colors.length > 0 && (
        <div className="dsb-stat dsb-colors">
          <span className="dsb-val dsb-colors-row">
            {colors.map((c) => <ManaIcon key={c} symbol={c} size={16} />)}
          </span>
          <span className="dsb-label">Colors</span>
        </div>
      )}
    </div>
  );
}
