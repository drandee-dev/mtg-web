// The ~3,400-entry commander browse directory, fetched once per session and
// shared across every caller. Split out of Commanders.jsx so it can be a
// plain module import for both the component that renders the directory and
// GlobalToolbar's hover-prefetch — a component file can only export
// components without breaking Fast Refresh (react-refresh/only-export-components).
import { api } from "./api";

let _dirPromise = null;

/** Fetched once; every call after the first resolves to the same in-flight or
 * settled promise. Calling this from a hover handler before the Commanders
 * tab ever mounts is exactly the point — see GlobalToolbar.jsx. */
export function loadDirectory() {
  if (!_dirPromise) {
    _dirPromise = api.commanderDirectory().catch((e) => {
      _dirPromise = null;
      throw e;
    });
  }
  return _dirPromise;
}
