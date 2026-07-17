// Browser-back integration (navigation audit 2026-07-17).
//
// One module owns popstate so back behaves like a native app:
//   - if a layer (modal / sheet / panel) is open, back closes the TOP layer;
//   - otherwise back walks tab history (App registers the tab handler).
//
// Layers: useBackClose(active, onClose) pushes one history entry (tagged
// { mtgwebLayer: id }) when the layer opens. Closing via back pops it
// naturally. Closing any other way (Esc / ✕ / backdrop) just deregisters the
// layer, leaving a GHOST entry — deliberately, because history.back() is
// async and races any pushState from a close-and-navigate action (e.g. the
// card modal's "Rules" button closes the modal AND switches tabs in the same
// commit). Ghosts are harmless and short-lived:
//   - the tab effect recycles a top-of-stack ghost via replaceState
//     (historyTopIsGhost) instead of pushing on top of it;
//   - the pop handler skips over ghosts with a chained back(), so a user
//     back-press never lands on one (no dead presses).

import { useEffect, useRef } from "react";

const _layers = []; // [{ id, onClose, viaPop }]
let _onPopTab = null;
let _layerSeq = 0;

function _isLive(id) {
  return _layers.some((l) => l.id === id);
}

function _handlePop() {
  const top = _layers[_layers.length - 1];
  if (top) {
    top.viaPop = true;
    _layers.pop();
    top.onClose();
    return;
  }
  const marker = window.history.state?.mtgwebLayer;
  if (marker && !_isLive(marker)) {
    // Landed on a ghost (layer already closed by other means) — keep going.
    window.history.back();
    return;
  }
  if (_onPopTab) _onPopTab();
}

let _bound = false;
function _bind() {
  if (_bound) return;
  _bound = true;
  window.addEventListener("popstate", _handlePop);
}

/** App calls this once: `onPopTab` restores the tab from the URL on back. */
export function registerTabHandler(onPopTab) {
  _bind();
  _onPopTab = onPopTab;
}

/** True when the current history entry is an abandoned layer entry — the tab
 * effect then replaces it instead of pushing a new entry on top of it. */
export function historyTopIsGhost() {
  const marker = window.history.state?.mtgwebLayer;
  return Boolean(marker && !_isLive(marker));
}

/** Push a history entry while `active`; call `onClose` when back is pressed.
 * Use in any modal/sheet/panel that should close on the back gesture. */
export function useBackClose(active, onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (!active) return;
    _bind();
    const id = ++_layerSeq;
    const layer = { id, onClose: () => closeRef.current(), viaPop: false };
    _layers.push(layer);
    window.history.pushState({ mtgwebLayer: id }, "");
    return () => {
      if (layer.viaPop) return; // back already consumed the entry
      const i = _layers.indexOf(layer);
      if (i >= 0) _layers.splice(i, 1); // entry becomes a ghost (see header)
    };
  }, [active]);
}
