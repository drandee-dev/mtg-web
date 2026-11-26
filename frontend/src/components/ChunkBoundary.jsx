import { Component } from "react";

// Around the lazily loaded parts of the app (audit job 5.10). A chunk that fails to
// load (an open tab asking for a file a newer deploy replaced, a dropped connection)
// would otherwise unmount the whole app to a blank page. main.jsx reloads once on
// Vite's preloadError first; this panel is what is left if that did not help.
export default class ChunkBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("A part of the app failed to load", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div className="panel" role="alert">
        <h2>This part of the app didn&apos;t load</h2>
        <p className="muted small">
          A newer version may be out, or the connection dropped. Reloading gets the current version.
        </p>
        <button className="primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
