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
    // The entry now on top was pushed before the layer opened, and the app may
    // have moved on from its address since (a deck saved under an open modal).
    if (_onPopTab) _onPopTab(true);
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

/** App calls this once: `onPopTab` restores the tab from the URL on back. It is
 * also called with `true` after back closes a layer, when the app stays where
 * it is and only the address it landed on may need correcting. */
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
 * Use in any modal/sheet/panel that should close on the back gesture. With a
 * `url` the entry carries that address while the layer is open (Playtest's
 * /decks/<id>/playtest); closing the layer any other way puts the address
 * back, unless the app has already moved somewhere else. */
export function useBackClose(active, onClose, url = null) {
  const closeRef = useRef(onClose);
  // The address is read when the layer opens and then left alone: the app
  // moving to another place under an open layer must not push a second entry.
  const urlRef = useRef(url);
  useEffect(() => { closeRef.current = onClose; urlRef.current = url; });
  useEffect(() => {
    if (!active) return;
    _bind();
    const id = ++_layerSeq;
    const layerUrl = urlRef.current;
    const layer = { id, onClose: () => closeRef.current(), viaPop: false };
    _layers.push(layer);
    const { pathname, search, hash } = window.location;
    const beneath = pathname + search + hash;
    // No url: two arguments, which leaves the address (fragment included) alone.
    if (layerUrl) window.history.pushState({ mtgwebLayer: id }, "", layerUrl);
    else window.history.pushState({ mtgwebLayer: id }, "");
    return () => {
      if (layer.viaPop) return; // back already consumed the entry
      const i = _layers.indexOf(layer);
      if (i >= 0) _layers.splice(i, 1); // entry becomes a ghost (see header)
      // The ghost should read as the address beneath it, not the layer's.
      if (layerUrl && window.location.pathname === layerUrl) window.history.replaceState(window.history.state, "", beneath);
    };
  }, [active]);
}
