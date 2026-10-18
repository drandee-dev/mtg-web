import { useEffect, useState } from "react";
import { subscribeBusy } from "../../lib/api";

// A 3px line across the top of the page while a request is out, so work that
// has no screen of its own (a tab refresh, a search, a save) still shows. It
// appears only once a request has been out for 300ms: a quick answer never
// flashes it. Indeterminate (we do not know how long a request will take), and
// aria-hidden: the regions that are loading say so themselves.
const SHOW_AFTER_MS = 300;

export default function TopProgress() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let timer = null;
    const stop = subscribeBusy((count) => {
      if (count > 0) {
        if (!timer) timer = setTimeout(() => setOn(true), SHOW_AFTER_MS);
      } else {
        clearTimeout(timer);
        timer = null;
        setOn(false);
      }
    });
    return () => { stop(); clearTimeout(timer); };
  }, []);

  return on ? <div className="top-progress" aria-hidden="true"><i /></div> : null;
}
