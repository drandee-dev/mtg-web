import LoadingIndicator from "../LoadingIndicator";
import { sanitizeHtml } from "../../lib/sanitize";

// How to play (UX overhaul job 3.4): the deck's strategy, game plan and key
// synergies from one AI call, written when the tab is first opened and again
// only on "Write it again". The upgrade path below is the composition gaps,
// which are deterministic: no AI call.
export default function HowToPlay({
  strategy, loading, error, stale, enough, minCards, comp, onWriteAgain, onOpenImprove,
}) {
  const thin = comp?.categories?.filter((c) => c.status === "thin") || [];
  const written = Boolean(strategy?.game_plan);

  return (
    <div className="htp">
      {!enough && (
        <p className="muted">
          Add a few more cards and this page can say how the deck plays. It needs {minCards}.
        </p>
      )}

      {enough && loading && <LoadingIndicator label="Writing how to play" active />}
      {enough && error && !loading && <p className="htp-error" role="alert">{error}</p>}

      {enough && strategy?.strategy && (
        <section className="panel htp-sec" aria-labelledby="htp-strategy">
          <h3 id="htp-strategy" className="htp-h">Strategy</h3>
          <p
            className="htp-text"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(strategy.strategy.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")),
            }}
          />
        </section>
      )}

      {enough && written && (
        <>
          <section className="panel htp-sec" aria-labelledby="htp-plan">
            <h3 id="htp-plan" className="htp-h">Game plan</h3>
            <p className="htp-text">{strategy.game_plan}</p>
          </section>

          {strategy.synergies?.length > 0 && (
            <section className="panel htp-sec" aria-labelledby="htp-syn">
              <h3 id="htp-syn" className="htp-h">Key synergies</h3>
              <ul className="htp-syn">
                {strategy.synergies.map((s) => (
                  <li key={s.cards.join("|")}>
                    <span className="htp-cards">{s.cards.join(" + ")}</span>
                    {s.note && <span className="htp-note"> {s.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {enough && (
        <div className="htp-actions">
          <button
            type="button"
            className="ghost small"
            onClick={onWriteAgain}
            disabled={loading}
          >
            {written || strategy?.strategy ? "Write it again" : "Write how to play"}
          </button>
          {stale && written && !loading && (
            <span className="muted small">The cards have changed since this was written.</span>
          )}
        </div>
      )}

      <section className="panel htp-sec" aria-labelledby="htp-up">
        <h3 id="htp-up" className="htp-h">Upgrade path</h3>
        {thin.length > 0 ? (
          <ul className="htp-syn">
            {thin.map((c) => (
              <li key={c.key}>
                <span className="htp-cards">{c.label}</span>
                <span className="htp-note"> {c.count}{c.target ? ` of ${c.target}` : ""}, thin</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">
            {comp ? "No category is thin." : "Open Improve to check the deck's categories."}
          </p>
        )}
        <button type="button" className="ghost small" onClick={onOpenImprove}>
          Open Improve
        </button>
      </section>
    </div>
  );
}
