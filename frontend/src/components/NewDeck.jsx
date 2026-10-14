import { useEffect, useRef, useState } from "react";
import { api, BRACKETS, FORMATS, PRICE_CAPS, assembleForStorage, disassembleDecklist, getCardImage } from "../lib/api";
import { searchCommanders as scryfallSearchCommanders } from "../lib/scryfall";
import { loadDirectory } from "../lib/commanderDirectory";
import { parseNarration } from "../lib/buildNotes";
import { parseCollectionCsv, buildOwnedIndex, ownedQuantity } from "../lib/collection";
import { commanderDisplay, commanderNamesClean } from "../lib/deckParser";
import { SPELL_CATS, assembleSkeleton, mergeFills } from "../lib/fillMerge";
import { fmtUsd } from "../lib/format";
import { useCardImage } from "../lib/hooks";
import { SearchIcon } from "./Icons";
import LoadingIndicator from "./LoadingIndicator";
import Wizard from "./Wizard";

// The New deck screen (/new): every way to start a deck, on one page. Two
// large cards take input right there ("Describe what you like", "I know my
// commander"); the smaller doors open a step of their own or, for a blank
// deck, make it at once.
//
// Every door ends the same way: one onCreate(deck), which saves the deck and
// opens it at its own address. Nothing here is a deck until then, so there is
// no unsaved new deck anywhere in the app. A built deck is created the moment
// the build returns, not after a review screen it could be lost on.
//
// A door's badge says what its code calls, not what the door is for. "Uses AI"
// means a request behind the server's _check_ai_access: wizard/narrate and
// ai/fills for every built deck, planeswalker/chat to turn a description into
// a commander. The skeleton, the precon lookup and the importers call none.

const AI = "Uses AI";
const NO_AI = "No AI";

// `steps[0]` is this screen. The two large cards have no desc or badge here:
// their copy is written out on the card.
const BRANCHES = {
  describe: {
    label: "Describe what you like",
    steps: ["Choose a path", "Pick the commander", "Build the deck"],
  },
  commander: {
    label: "I know my commander",
    steps: ["Choose a path", "Pick a commander", "Build the deck"],
  },
  guided: {
    label: "Guide me step by step",
    desc: "Pick a commander, then choose every card, one category at a time.",
    badge: NO_AI,
    steps: ["Choose a path", "Pick a commander", "Fill each category"],
  },
  precon: {
    label: "Start from a precon",
    desc: "Name a preconstructed deck and get its real decklist, ready to tune.",
    badge: NO_AI,
    steps: ["Choose a path", "Name the precon", "Confirm the deck"],
  },
  collection: {
    label: "Build from my collection",
    desc: "Best deck from cards you already own, with only the gaps priced.",
    badge: AI,
    steps: ["Choose a path", "Load your collection", "Pick a commander", "Build the deck"],
  },
  paste: {
    label: "Paste or import a list",
    desc: "From Moxfield, Archidekt, Arena or plain text.",
    badge: NO_AI,
    steps: ["Choose a path", "Paste or import"],
  },
};

// The doors under the two large cards. "Blank deck" follows them and has no
// step of its own.
const OTHER_DOORS = ["guided", "precon", "collection", "paste"];
const BLANK = { name: "Untitled deck", format: "commander", decklist_text: "" };

// The one deck a save turned down, kept until it is saved or discarded. It
// belongs to no account yet: a retry saves it to whoever is signed in then.
const UNSAVED_KEY = "mtgweb:unsavedNewDeck";
function loadUnsaved() {
  try {
    const deck = JSON.parse(localStorage.getItem(UNSAVED_KEY));
    return typeof deck?.decklist_text === "string" && typeof deck.name === "string" ? deck : null;
  } catch { return null; }
}
/** Keep `deck`, or clear the slot with null. Best effort: if this browser's
 * storage is what failed, the deck still lives on the open screen. */
function keepUnsaved(deck) {
  try {
    if (deck) localStorage.setItem(UNSAVED_KEY, JSON.stringify(deck));
    else localStorage.removeItem(UNSAVED_KEY);
  } catch { /* storage full or blocked */ }
}

/** Stably reorder every skeleton category (and land lists) owned-first, so
 *  assembleSkeleton's greedy slice — which just takes the first N candidates
 *  per category — keeps owned cards over unowned ones wherever it has a
 *  choice. Cards the collection doesn't have keep their place at the back,
 *  so a thin owned pool still falls back to them rather than leaving gaps. */
function ownedFirstSkeleton(skeleton, ownedIndex) {
  const rank = (c) => (ownedQuantity(c.name, ownedIndex) > 0 ? 0 : 1);
  const sortOwnedFirst = (list) => [...(list || [])].sort((a, b) => rank(a) - rank(b));
  const out = { ...skeleton };
  for (const [key] of SPELL_CATS) out[key] = sortOwnedFirst(skeleton?.[key]);
  out.suggested_lands = sortOwnedFirst(skeleton?.suggested_lands);
  out.lands = sortOwnedFirst(skeleton?.lands);
  return out;
}

/** Split a fill-suggestion list into [owned, notOwned], each keeping its
 *  original order. The gap-closing loop processes owned first so an unowned
 *  suggestion is only used once the owned pool can't fill the slot. */
function partitionOwned(list, ownedIndex) {
  const owned = [];
  const other = [];
  for (const item of list) (ownedQuantity(item.name, ownedIndex) > 0 ? owned : other).push(item);
  return [owned, other];
}

/** Flatten an ai/fills response into mergeFills' proposed list. Every
 *  category it returns is a thin one, suggestions or not; `spare` is what
 *  the healthy ones can lose. */
function fillProposals(fills) {
  const list = fills?.fills || [];
  return {
    proposed: list.flatMap((f) => (f.suggestions || []).map((s) => ({ ...s, category: f.category || "Fills" }))),
    thinLabels: list.map((f) => f.category),
    spare: fills?.spare || {},
  };
}

/** Carry fill reasons into the build notes, and say which spell a fill cut. */
function noteFills(notes, { added, cut }) {
  for (const c of cut) delete notes[c.name];
  for (const a of added) {
    const why = [a.reason, a.displaced && `Cut ${a.displaced} to make room.`].filter(Boolean).join(" ");
    if (why) notes[a.name] = why;
  }
}

/** Total copies in a raw "N Card Name" decklist. */
function parseDeckLines(text) {
  return (text || "").split("\n").reduce((n, l) => {
    const m = l.trim().match(/^(\d+)\s+\S/);
    return n + (m ? Number(m[1]) : 0);
  }, 0);
}

function toLines(cards, basics) {
  return [
    ...cards.map((c) => `${c.qty} ${c.name}`),
    ...[...basics.entries()].map(([n, q]) => `${q} ${n}`),
  ].join("\n");
}

/** `onCreate(deck)` saves `{ name, format, decklist_text }` and opens it. It
 * also takes what only the door knows: `notes` (why each card is there),
 * `toast`, and `arrival` (what the deck page shows once when it opens: the
 * upgrade guide after a paste, the buy list after a collection build). It
 * rejects when the save fails. `seed` is a commander named by the address. */
export default function NewDeck({ onCreate, notify, seed }) {
  // A seed opens on the commander door, looking the name up.
  const [branch, setBranch] = useState(seed ? "commander" : null);
  const [stepIdx, setStepIdx] = useState(seed ? 1 : 0);
  const [format, setFormat] = useState("commander");
  const [bracket, setBracket] = useState(null);
  const [maxCardPrice, setMaxCardPrice] = useState(null); // USD per card; null = any price

  const [describeText, setDescribeText] = useState("");
  const [describing, setDescribing] = useState(false);
  const [candidates, setCandidates] = useState(null); // null | [] | [{name,...}]
  const [partnerFor, setPartnerFor] = useState(null); // {name, kind} while choosing a partner
  const [chosen, setChosen] = useState(null); // [commander] or a pair, picked on the commander door
  const [looking, setLooking] = useState(Boolean(seed)); // a named commander being looked up
  const [searching, setSearching] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const searchDebounce = useRef(null);
  const searchSeq = useRef(0);
  const searchAbort = useRef(null);
  // One-tap picks: the five the commander directory ranks first, the same five
  // the Commanders page opens with. That rank is a card's EDHREC rank (how
  // widely it is played at all), not how popular it is as a commander.
  const [top, setTop] = useState([]);

  const [progress, setProgress] = useState(null); // null | {label, pct}
  const [preconQuery, setPreconQuery] = useState("");
  const [precon, setPrecon] = useState(null); // the import-precon payload

  const [collectionText, setCollectionText] = useState("");
  const [ownedIndex, setOwnedIndex] = useState(null); // Map(normalizedName -> {name, quantity})
  const [collectionStats, setCollectionStats] = useState(null); // {skipped} | null (unique count reads from ownedIndex.size)

  const [pasteText, setPasteText] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [importing, setImporting] = useState(false);

  // One deck per press: `creating` disables the doors and turns a second press
  // away (React renders between two clicks, so the second sees it). `failed`
  // is the deck a save turned down. It is kept in this browser as well
  // (keepUnsaved), so it is offered again whenever this screen opens: a built
  // deck was paid for, and Back, a reload or a bar link would otherwise drop it.
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(loadUnsaved);

  const steps = branch ? BRANCHES[branch].steps : null;
  const stepCount = steps?.length ?? null;
  const pct = stepCount ? Math.round((stepIdx / (stepCount - 1)) * 100) : 0;

  async function create(deck) {
    if (creating) return;
    setCreating(true);
    setFailed(null);
    try {
      await onCreate(deck);
      keepUnsaved(null);
    } catch (e) {
      // This can land after the screen is gone (a build that outlasted the
      // visit): the copy in storage is what the next visit finds.
      keepUnsaved(deck);
      setFailed(deck);
      notify?.(`Couldn't save the deck: ${e.message}. It is kept on the New deck screen.`);
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadDirectory()
      .then((r) => {
        if (cancelled) return;
        const ranked = (r.commanders || []).filter((c) => c.edhrec_rank != null);
        setTop(ranked.sort((a, b) => a.edhrec_rank - b.edhrec_rank).slice(0, 5).map((c) => c.name));
      })
      .catch(() => { /* the picks are a shortcut; the search still works */ });
    return () => { cancelled = true; };
  }, []);

  // A commander on the commander door: straight to the choice, or by way of the
  // partner step when it can share the command zone (a Background can't lead alone).
  function pick(c) {
    setBranch("commander");
    setStepIdx(1);
    setCandidates(null);
    if (c.partner_kind) { setChosen(null); setPartnerFor({ name: c.name, kind: c.partner_kind }); }
    else { setPartnerFor(null); setChosen([c.name]); }
  }

  // A commander known only by name: a one-tap pick, or the one a commander
  // page's link names. The search says whether it can have a partner, and that
  // it is a real commander: a name in an address is never taken on trust, and
  // a lookup that could not be made counts as a no.
  function found(name, hit) {
    setLooking(false);
    if (hit) return pick(hit);
    setBranch(null);
    setStepIdx(0);
    notify?.(hit === null
      ? `“${name}” isn't a commander this app knows. Search for it here.`
      : "Couldn't look that commander up. Search for it here.");
  }
  // An exact match, null when there is none, undefined when the lookup failed.
  // A failed lookup is not a yes.
  const lookUp = (name) => api.commanders(name)
    .then((r) => (r.results || []).find((c) => c.name === name) || null, () => undefined);
  function choose(name) {
    setLooking(true);
    lookUp(name).then((hit) => found(name, hit));
  }

  // The address named a commander (/new?commander=<name>). Looking it up is
  // all that happens by itself: nothing is built until a button is pressed.
  useEffect(() => {
    if (!seed) return;
    let cancelled = false;
    lookUp(seed).then((hit) => { if (!cancelled) found(seed, hit); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  function pickBranch(id) {
    setBranch(id);
    setStepIdx(1);
    setCandidates(null);
    setPartnerFor(null);
    setChosen(null);
    setPrecon(null);
    setCollectionText("");
    setOwnedIndex(null);
    setCollectionStats(null);
  }

  function back() {
    setPrecon(null);
    setPartnerFor(null);
    if (stepIdx <= 1) {
      // Back on this screen: the search and its results belong to the door left.
      setBranch(null);
      setStepIdx(0);
      setChosen(null);
      setCandidates(null);
      setCmdQuery("");
      return;
    }
    setStepIdx((i) => i - 1);
  }

  // --- Precon ---------------------------------------------------------------
  // The endpoint fuzzy-matches server side (exact > prefix > substring) and
  // returns the best hit plus `alternates`, so there is no matching to do here.
  async function findPrecon() {
    const name = preconQuery.trim();
    if (name.length < 3) return notify?.("Type at least part of the deck's name.");
    setSearching(true);
    try {
      const r = await api.importPrecon(name);
      setPrecon(r);
      setStepIdx(2);
    } catch (e) {
      notify?.(`No precon found: ${e.message}`);
    } finally {
      setSearching(false);
    }
  }

  function finishPrecon() {
    // No notes: nothing explained these picks, and inventing a reason would be
    // worse than showing none.
    create({
      name: precon.name || commanderDisplay(precon.commander || "") || "Precon",
      format: "commander",
      decklist_text: assembleForStorage(precon.decklist, precon.commander || "", ""),
    });
  }

  // --- Paste or import -------------------------------------------------------
  // A list the person already has. Either way it opens with the upgrade guide,
  // as a paste into an empty deck always has.
  function createFromText() {
    const { commander, deckText, maybeboard } = disassembleDecklist(pasteText);
    if (!deckText.trim() && !commander) return notify?.("Paste a decklist first.");
    create({
      name: commander ? commanderDisplay(commander) : "Imported deck",
      format: "commander",
      decklist_text: assembleForStorage(deckText, commander, maybeboard),
      arrival: { review: true },
    });
  }

  async function createFromUrl() {
    // Enter in the field reaches here too, and a held key repeats.
    if (importing || creating) return;
    const url = pasteUrl.trim();
    if (!url) return notify?.("Paste a deck link first.");
    setImporting(true);
    try {
      const res = await api.importUrl(url);
      const { commander, deckText, maybeboard } = disassembleDecklist(res.decklist || "");
      // The source's sideboard and maybeboard land in Considering, never the deck.
      const side = [res.sideboard, maybeboard].filter(Boolean).join("\n").trim();
      if (!deckText.trim() && !commander && !side) throw new Error("no cards found in the import");
      await create({
        name: res.name || (commander ? commanderDisplay(commander) : "Imported deck"),
        format: res.format || "commander",
        decklist_text: assembleForStorage(deckText, commander, side),
        arrival: { review: true },
      });
    } catch (e) {
      notify?.(`Import failed: ${e.message}`);
    } finally {
      setImporting(false);
    }
  }

  // --- Describe → commander ------------------------------------------------
  // One model call to name a commander, then the real commander endpoint to
  // verify it exists (and to offer alternatives). If the model is unavailable
  // the text itself becomes a plain name search, which still gets somewhere.
  async function resolveFromDescription() {
    const text = describeText.trim();
    if (text.length < 3) return notify?.("Describe the deck in a few words first.");
    setDescribing(true);
    try {
      let name = "";
      try {
        const prompt =
          "Name exactly one legendary creature that is legal as a Commander and best matches the " +
          "request below. Reply with ONLY the card name — no punctuation, no explanation.\n" +
          `<user_input>${text.slice(0, 400)}</user_input>`;
        const r = await api.planeswalkerChat([{ role: "user", content: prompt }], "", format, "");
        name = (r?.response || "").trim().split("\n")[0].replace(/^["'*\s]+|["'*.\s]+$/g, "").slice(0, 80);
      } catch { /* fall through to a plain name search */ }
      const r = await api.commanders(name || text.slice(0, 60));
      const results = r.results || [];
      if (!results.length) return notify?.("No commander matched that — try different words.");
      setCandidates(results);
      setPartnerFor(null);
      setBranch("describe");
      setStepIdx(1);
    } catch (e) {
      notify?.(`Couldn't find a commander: ${e.message}`);
    } finally {
      setDescribing(false);
    }
  }

  // Debounced, same 250ms the other typeaheads use, with a sequence guard so a
  // slow early response can't overwrite a newer one. Unconstrained (no partner
  // legality involved, just "pick a commander to build around") — straight to
  // Scryfall, same as CommanderInput's first-commander path. See lib/scryfall.js
  // for why that split exists and what was verified before making the change.
  function searchCommanders(q) {
    clearTimeout(searchDebounce.current);
    searchAbort.current?.abort();
    const query = q.trim();
    if (query.length < 2) { setCandidates(null); setSearching(false); return; }
    setSearching(true);
    searchDebounce.current = setTimeout(async () => {
      const mine = ++searchSeq.current;
      const controller = new AbortController();
      searchAbort.current = controller;
      try {
        const results = await scryfallSearchCommanders(query, { signal: controller.signal });
        if (mine !== searchSeq.current) return;
        setCandidates(results);
      } catch (e) {
        if (e.name === "AbortError" || mine !== searchSeq.current) return;
        setCandidates([]);
        notify?.(`Search failed: ${e.message}`);
      } finally {
        if (mine === searchSeq.current) setSearching(false);
      }
    }, 250);
  }

  // What a finished build hands to onCreate. The toast carries the summary the
  // review screen used to; the reasons themselves are on each card.
  function builtDeck(commanderName, cards, basics, notes, decklist_text, arrival) {
    const total = cards.reduce((n, c) => n + c.qty, 0)
      + [...basics.values()].reduce((n, q) => n + q, 0) + commanderNamesClean(commanderName).length;
    const withReason = cards.filter((c) => notes[c.name]).length;
    return {
      name: commanderDisplay(commanderName), format, decklist_text, notes, arrival,
      toast: `Deck built: ${total} cards. ${withReason} of ${cards.length} picks carry a reason.`,
    };
  }

  // --- One-shot generate ---------------------------------------------------
  // cmdNames: [commander] or a partner pair; the API takes the "A && B" string.
  async function generate(cmdNames) {
    const commanderName = cmdNames.join(" && ");
    setStepIdx(steps.length - 1);
    setProgress({ label: "Building the skeleton", pct: 15 });
    try {
      const sk = await api.wizardSkeleton(commanderName, format, bracket, maxCardPrice);
      if (sk?.error) throw new Error(sk.message || "Commander not found.");
      const colors = sk.commander?.color_identity || [];
      const { cards, basics } = assembleSkeleton({ ...sk.skeleton, _colors: colors }, cmdNames);
      if (!cards.length) throw new Error("No suggestions came back for that commander.");

      const notes = {};
      for (const c of cards) if (c.reason) notes[c.name] = c.reason;

      const header = `Commander\n${cmdNames.map((n) => `1 ${n}`).join("\n")}\nDeck\n`;
      let full = header + toLines(cards, basics);

      // Per-category reasoning. Best-effort: a deck with EDHREC reasons only
      // is still a deck, so a failed or unavailable model never blocks the build.
      setProgress({ label: "Writing the reasoning", pct: 45 });
      const byCat = new Map();
      for (const c of cards) {
        if (!byCat.has(c.category)) byCat.set(c.category, []);
        byCat.get(c.category).push(c.name);
      }
      const narrations = await Promise.allSettled(
        [...byCat.entries()].map(([label, names]) =>
          api.wizardNarrate(commanderName, label, names.slice(0, 10), full)
            .then((r) => (r?.error ? {} : parseNarration(r?.narration, names))),
        ),
      );
      for (const n of narrations) {
        if (n.status === "fulfilled") Object.assign(notes, n.value);
      }

      // Close whatever composition gaps the deck still reports. mergeFills
      // keeps the count at 100 and the lands at the 36 floor.
      setProgress({ label: "Closing category gaps", pct: 80 });
      let merged = { cards, basics, added: [], cut: [] };
      try {
        const fills = await api.aiFills(full, format, bracket, undefined, maxCardPrice);
        merged = mergeFills({ cards, basics, commanders: cmdNames, ...fillProposals(fills) });
      } catch { /* fills are optional — the skeleton deck stands on its own */ }
      noteFills(notes, merged);

      const finalCards = [...merged.cards, ...merged.added];
      full = header + toLines(finalCards, merged.basics);
      // Saved the moment it exists: these calls were paid for.
      setProgress({ label: "Saving the deck", pct: 95 });
      await create(builtDeck(commanderName, finalCards, merged.basics, notes, full));
    } catch (e) {
      notify?.(`Build failed: ${e.message}`);
      setStepIdx(steps.length - 2);
    } finally {
      setProgress(null);
    }
  }

  // Candidate list, or the partner step once a partner-capable commander is
  // picked. `onNames` takes [commander] or a pair: it builds (describe,
  // collection) or, on the commander door, only settles who the commander is,
  // and `go` is what its buttons say so. `onPick` takes over a click there.
  function commanderChoices(onNames, go = "Build the 99 →", onPick = null) {
    if (partnerFor) {
      return (
        <PartnerStep first={partnerFor} onCancel={() => setPartnerFor(null)} builds={go !== "Choose →"}
          onBuild={(names) => { setPartnerFor(null); onNames(names); }} />
      );
    }
    if (!candidates?.length) return null;
    return (
      <div className="gen-candidates" role="listbox" aria-label="Commander choices">
        {candidates.slice(0, 8).map((c) => (
          <button key={c.name} role="option" aria-selected="false" className="gen-candidate"
            onClick={() => {
              if (onPick) onPick(c);
              else if (c.partner_kind) setPartnerFor({ name: c.name, kind: c.partner_kind });
              else onNames([c.name]);
            }}>
            <span className="gen-candidate-name">{c.name}</span>
            <span className="muted small">{c.type_line}</span>
            <span className="gen-candidate-go">{c.partner_kind ? "Add a partner? →" : go}</span>
          </button>
        ))}
      </div>
    );
  }

  // --- Collection -----------------------------------------------------------
  function loadCollection(text) {
    const { rows, skipped } = parseCollectionCsv(text);
    if (!rows.length) {
      setOwnedIndex(null);
      setCollectionStats(null);
      return;
    }
    setOwnedIndex(buildOwnedIndex(rows));
    setCollectionStats({ skipped });
  }

  function onCollectionFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result);
      setCollectionText(txt);
      loadCollection(txt);
    };
    reader.onerror = () => notify?.("Could not read that file.");
    reader.readAsText(file);
  }

  // Same one-shot composition as generate(), constrained to the owned
  // collection first: the skeleton categories are reordered owned-first
  // before assembleSkeleton picks its slots, and ai/fills gap-closers only
  // reach for an unowned card once the owned pool can't fill the slot.
  // Every non-basic pick is then flagged owned or not, and the unowned ones
  // get priced via the same per-name lookup CardPreview/CardBottomSheet use.
  async function generateFromCollection(cmdNames) {
    const commanderName = cmdNames.join(" && ");
    setStepIdx(steps.length - 1);
    setProgress({ label: "Building the skeleton", pct: 15 });
    try {
      const sk = await api.wizardSkeleton(commanderName, format, bracket, maxCardPrice);
      if (sk?.error) throw new Error(sk.message || "Commander not found.");
      const colors = sk.commander?.color_identity || [];
      const ownedFirst = ownedFirstSkeleton(sk.skeleton, ownedIndex);
      // The price cap is about what you'd have to buy: owned cards ignore it.
      const { cards, basics } = assembleSkeleton({ ...ownedFirst, _colors: colors }, cmdNames,
        (name) => ownedQuantity(name, ownedIndex) > 0);
      if (!cards.length) throw new Error("No suggestions came back for that commander.");

      const notes = {};
      for (const c of cards) if (c.reason) notes[c.name] = c.reason;

      const header = `Commander\n${cmdNames.map((n) => `1 ${n}`).join("\n")}\nDeck\n`;
      let full = header + toLines(cards, basics);

      setProgress({ label: "Writing the reasoning", pct: 40 });
      const byCat = new Map();
      for (const c of cards) {
        if (!byCat.has(c.category)) byCat.set(c.category, []);
        byCat.get(c.category).push(c.name);
      }
      const narrations = await Promise.allSettled(
        [...byCat.entries()].map(([label, names]) =>
          api.wizardNarrate(commanderName, label, names.slice(0, 10), full)
            .then((r) => (r?.error ? {} : parseNarration(r?.narration, names))),
        ),
      );
      for (const n of narrations) {
        if (n.status === "fulfilled") Object.assign(notes, n.value);
      }

      setProgress({ label: "Closing category gaps", pct: 65 });
      let merged = { cards, basics, added: [], cut: [] };
      try {
        const fills = await api.aiFills(full, format, bracket, undefined, maxCardPrice);
        const { proposed, thinLabels, spare } = fillProposals(fills);
        merged = mergeFills({
          cards, basics, commanders: cmdNames, thinLabels, spare,
          proposed: partitionOwned(proposed, ownedIndex).flat(),
        });
      } catch { /* fills are optional — the skeleton deck stands on its own */ }
      noteFills(notes, merged);

      const finalCards = [...merged.cards, ...merged.added];
      full = header + toLines(finalCards, merged.basics);

      // Owned vs buy: flag every non-basic pick, then price only the gap.
      setProgress({ label: "Pricing what you'd need to buy", pct: 88 });
      const buyList = [];
      for (const c of finalCards) {
        c.owned = ownedQuantity(c.name, ownedIndex) > 0;
        if (!c.owned) buyList.push(c);
      }
      const priced = await Promise.allSettled(buyList.map((c) => getCardImage(c.name)));
      let buyTotal = 0;
      priced.forEach((r, i) => {
        const price = r.status === "fulfilled" ? r.value?.price_usd : null;
        buyList[i].price_usd = price ?? null;
        if (price != null) buyTotal += price;
      });

      // The buy list is what this door is for. It goes with the deck and shows
      // once, on the deck page, now that there is no review screen to hold it.
      setProgress({ label: "Saving the deck", pct: 95 });
      await create(builtDeck(commanderName, finalCards, merged.basics, notes, full, {
        buy: {
          list: buyList.map((c) => ({ name: c.name, price_usd: c.price_usd })),
          total: buyTotal, owned: finalCards.length - buyList.length, picks: finalCards.length,
        },
      }));
    } catch (e) {
      notify?.(`Build failed: ${e.message}`);
      setStepIdx(steps.length - 2);
    } finally {
      setProgress(null);
    }
  }

  /* ── A deck the save turned down: nothing else until it is saved or dropped ─ */
  if (failed) {
    return (
      <div className="gen">
        <div className="panel" role="alert">
          <h2 className="gen-h2" style={{ marginTop: 0 }}>“{failed.name}” isn’t saved yet</h2>
          <p className="gen-lede">The save didn’t go through. The deck is kept in this browser until it is saved: try again, or discard it.</p>
          <div className="row" style={{ gap: ".4rem" }}>
            <button className="primary" onClick={() => create(failed)} disabled={creating}>
              {creating ? "Saving…" : "Try again"}
            </button>
            <button className="ghost" onClick={() => { keepUnsaved(null); setFailed(null); }} disabled={creating}>Discard</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Guided branch: the existing category-fill wizard ──────────────────── */
  if (branch === "guided") {
    return (
      <div className="gen">
        <GenHeader steps={steps} stepIdx={1} pct={pct} onBack={back} />
        <Wizard
          notify={notify}
          onFinish={(decklist_text, cmd, fmt) => create({ name: commanderDisplay(cmd) || "Untitled deck", format: fmt, decklist_text })}
        />
      </div>
    );
  }

  /* ── The screen itself: two cards that take input, then the other doors ── */
  if (!branch) {
    return (
      <div className="nd">
        <div className="nd-head">
          <h1 className="nd-title">Start a new deck</h1>
          <p className="nd-sub">Pick how you want to begin. Everything can be changed afterwards.</p>
        </div>

        <div className="nd-cards">
          <section className="nd-card nd-card-lead" aria-labelledby="nd-describe">
            <div className="nd-card-head">
              <h2 id="nd-describe">{BRANCHES.describe.label}</h2>
              <span className="nd-tag nd-ai">{AI}</span>
            </div>
            <p>Say it in a sentence. You get commanders that fit, then a full deck around the one you pick, with a reason on the cards.</p>
            <textarea
              id="gen-describe"
              aria-label="Describe the deck you want"
              value={describeText}
              onChange={(e) => setDescribeText(e.target.value.slice(0, 400))}
              placeholder="Elves that flood the board and win with one huge attack"
              rows={3}
            />
            <div className="nd-card-foot">
              <label className="nd-field">
                Most to pay per card, optional
                <select value={maxCardPrice ?? ""} onChange={(e) => setMaxCardPrice(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Any price</option>
                  {PRICE_CAPS.map((v) => <option key={v} value={v}>Up to {fmtUsd(v)}</option>)}
                </select>
              </label>
              <button className="primary" onClick={resolveFromDescription} disabled={describing || creating || looking}>
                {describing ? "Finding a commander…" : "Find my commander →"}
              </button>
            </div>
          </section>

          <section className="nd-card" aria-labelledby="nd-commander">
            <div className="nd-card-head">
              <h2 id="nd-commander">{BRANCHES.commander.label}</h2>
            </div>
            <p>Pick the commander, then have the rest built around it or start from scratch.</p>
            <label className="nd-search">
              <SearchIcon size={16} />
              <input
                id="gen-cmd"
                aria-label="Search commanders"
                value={cmdQuery}
                onChange={(e) => { setCmdQuery(e.target.value); searchCommanders(e.target.value); }}
                placeholder="Search commanders"
                autoComplete="off"
              />
            </label>
            {searching && <p className="muted small">Searching…</p>}
            {commanderChoices(setChosen, "Choose →", pick)}
            {candidates?.length === 0 && !searching && (
              <p className="muted small">No commander matched. Try a different name.</p>
            )}
            {!candidates && top.length > 0 && (
              <div className="nd-chips">
                {top.map((name) => <CommanderChip key={name} name={name} onPick={choose} disabled={looking} />)}
              </div>
            )}
          </section>
        </div>

        <div className="nd-other">
          <h2>Other ways to start</h2>
          <div className="nd-doors">
            {OTHER_DOORS.map((id) => (
              // Not while a one-tap pick is being looked up: its answer opens
              // the commander door, over whichever door was pressed meanwhile.
              <button key={id} type="button" className="nd-door" onClick={() => pickBranch(id)} disabled={creating || looking}>
                <b>{BRANCHES[id].label}</b>
                <span>{BRANCHES[id].desc}</span>
                <i className={BRANCHES[id].badge === AI ? "nd-ai" : undefined}>{BRANCHES[id].badge}</i>
              </button>
            ))}
            <button type="button" className="nd-door" onClick={() => create(BLANK)} disabled={creating || looking}>
              <b>Blank deck</b>
              <span>Add cards one at a time.</span>
              <i>{NO_AI}</i>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Paste or import: a list the person already has ───────────────────── */
  if (branch === "paste") {
    return (
      <div className="gen">
        <GenHeader steps={steps} stepIdx={1} pct={pct} onBack={back} />
        <div className="panel">
          <label htmlFor="nd-paste">Decklist</label>
          <textarea
            id="nd-paste"
            className="gen-describe"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"1 Nethroi, Apex of Death\n1 Sol Ring\n1 Birds of Paradise\n…"}
            rows={8}
          />
          <p className="gen-lede">Arena exports, Moxfield or Archidekt text, or plain “1 Card Name” lines.</p>
          <button className="primary" onClick={createFromText} disabled={creating || !pasteText.trim()}>
            {creating ? "Saving…" : "Create the deck →"}
          </button>
        </div>
        <div className="panel">
          <label htmlFor="nd-url">Or a deck link</label>
          <input
            id="nd-url"
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createFromUrl(); }}
            placeholder="https://archidekt.com/decks/… or https://moxfield.com/decks/…"
            autoComplete="off"
          />
          <p className="gen-lede" style={{ marginTop: ".4rem" }}>The deck must be public. Its name and format come with it.</p>
          <button className="primary" onClick={createFromUrl} disabled={creating || importing || !pasteUrl.trim()}>
            {importing ? "Importing…" : "Import the deck →"}
          </button>
        </div>
      </div>
    );
  }

  /* ── Precon: name it, then confirm what came back ─────────────────────── */
  if (branch === "precon") {
    const cardCount = precon ? parseDeckLines(precon.decklist) : 0;
    return (
      <div className="gen">
        <GenHeader steps={steps} stepIdx={stepIdx} pct={pct} onBack={progress || creating ? null : back} />
        {!precon ? (
          <div className="panel">
            <label htmlFor="gen-precon">Precon name</label>
            <input
              id="gen-precon"
              value={preconQuery}
              onChange={(e) => setPreconQuery(e.target.value.slice(0, 80))}
              onKeyDown={(e) => { if (e.key === "Enter") findPrecon(); }}
              placeholder="e.g. Necron Dynasties"
              autoComplete="off"
            />
            <p className="gen-lede" style={{ marginTop: ".4rem" }}>
              Part of the name is enough. You get the published decklist, which you can then change freely.
            </p>
            <button className="primary" onClick={findPrecon} disabled={searching}>
              {searching ? "Looking it up…" : "Find this deck →"}
            </button>
          </div>
        ) : (
          <>
            <div className="panel">
              <h2 className="gen-h2" style={{ marginTop: 0 }}>{precon.name}</h2>
              <p className="gen-lede gen-summary">
                {cardCount} cards{precon.set ? ` · ${precon.set}` : ""}
                {precon.release ? ` · ${precon.release}` : ""}
                {precon.commander ? ` · led by ${precon.commander.split(" && ").join(" and ")}` : ""}
              </p>
              <div className="row" style={{ gap: ".4rem" }}>
                <button className="primary" onClick={finishPrecon} disabled={creating}>
                  {creating ? "Saving…" : "Create this deck →"}
                </button>
                <button className="ghost" onClick={() => { setPrecon(null); setStepIdx(1); }}>Pick another</button>
              </div>
            </div>
            {precon.alternates?.length > 0 && (
              <div className="panel">
                <h3 className="gen-cat">Other matches</h3>
                <div className="gen-candidates">
                  {precon.alternates.map((a) => (
                    <button key={a.name} className="gen-candidate"
                      onClick={() => { setPreconQuery(a.name); setPrecon(null); setStepIdx(1); }}>
                      <span className="gen-candidate-name">{a.name}</span>
                      <span className="muted small">{a.release}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ── Collection: load it, then pick a commander to build around ───────── */
  if (branch === "collection") {
    const canContinue = Boolean(ownedIndex && ownedIndex.size > 0);
    return (
      <div className="gen">
        <GenHeader steps={steps} stepIdx={stepIdx} pct={pct} onBack={progress || creating ? null : back} />
        {stepIdx === 1 ? (
          <div className="panel">
            <label htmlFor="gen-collection">Collection CSV</label>
            <textarea
              id="gen-collection"
              className="gen-describe"
              value={collectionText}
              onChange={(e) => { setCollectionText(e.target.value); loadCollection(e.target.value); }}
              placeholder={"name,set,quantity\nSol Ring,cmr,1\nCommand Tower,40k,2"}
              rows={6}
            />
            <div className="row" style={{ gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ margin: 0, cursor: "pointer" }}>
                <input type="file" accept=".csv,.txt" onChange={onCollectionFile} style={{ display: "none" }} />
                <span className="badge" style={{ cursor: "pointer" }}>Load file…</span>
              </label>
              {collectionStats && (
                <span className="muted small">
                  {ownedIndex.size} unique card{ownedIndex.size === 1 ? "" : "s"} recognized
                  {collectionStats.skipped > 0
                    ? ` · ${collectionStats.skipped} row${collectionStats.skipped === 1 ? "" : "s"} skipped`
                    : ""}
                </span>
              )}
              {collectionText.trim() && !canContinue && (
                <span className="muted small">No cards recognized — check it has name,set,quantity columns.</span>
              )}
            </div>
            <button className="primary" onClick={() => setStepIdx(2)} disabled={!canContinue} style={{ marginTop: ".6rem" }}>
              Continue →
            </button>
          </div>
        ) : progress ? (
          <div className="panel gen-building">
            <LoadingIndicator label={progress.label} active />
            <div className="gen-track"><div className="gen-fill" style={{ width: `${progress.pct}%` }} /></div>
            <p className="gen-lede">{progress.label}…</p>
          </div>
        ) : (
          <div className="panel">
            <div className="row" style={{ flexWrap: "wrap", marginBottom: ".6rem" }}>
              <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "auto" }} aria-label="Format">
                {FORMATS.filter(([v]) => v === "commander" || v === "paupercommander").map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
              <select value={bracket ?? ""} onChange={(e) => setBracket(e.target.value ? Number(e.target.value) : null)}
                style={{ width: "auto" }} aria-label="Target bracket">
                <option value="">Bracket: auto</option>
                {BRACKETS.map(([v, label]) => <option key={v} value={v}>Bracket {v} — {label}</option>)}
              </select>
              <select value={maxCardPrice ?? ""} onChange={(e) => setMaxCardPrice(e.target.value ? Number(e.target.value) : null)}
                style={{ width: "auto" }} aria-label="Max price per card">
                <option value="">Any card price</option>
                {PRICE_CAPS.map((v) => <option key={v} value={v}>Up to {fmtUsd(v)} a card</option>)}
              </select>
            </div>
            <label htmlFor="gen-cmd">Commander</label>
            <input
              id="gen-cmd"
              value={cmdQuery}
              onChange={(e) => { setCmdQuery(e.target.value); setPartnerFor(null); searchCommanders(e.target.value); }}
              placeholder="Start typing… e.g. atraxa"
              autoComplete="off"
            />
            {searching && <p className="muted small">Searching…</p>}
            {commanderChoices(generateFromCollection)}
            {candidates?.length === 0 && !searching && (
              <p className="muted small">No commander matched. Try a different name.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── Describe (the commanders that fit) and the commander door ─────────── */
  const isDescribe = branch === "describe";
  const cmdr = chosen ? chosen.join(" && ") : "";

  return (
    <div className="gen">
      <GenHeader steps={steps} stepIdx={stepIdx} pct={pct} onBack={progress || creating ? null : back} />

      {progress ? (
        <div className="panel gen-building">
          <LoadingIndicator label={progress.label} active />
          <div className="gen-track"><div className="gen-fill" style={{ width: `${progress.pct}%` }} /></div>
          <p className="gen-lede">{progress.label}…</p>
        </div>
      ) : (
        <div className="panel">
          <div className="row" style={{ flexWrap: "wrap", marginBottom: ".6rem" }}>
            <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "auto" }} aria-label="Format">
              {FORMATS.filter(([v]) => v === "commander" || v === "paupercommander").map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <select value={bracket ?? ""} onChange={(e) => setBracket(e.target.value ? Number(e.target.value) : null)}
              style={{ width: "auto" }} aria-label="Target bracket">
              <option value="">Bracket: auto</option>
              {BRACKETS.map(([v, label]) => <option key={v} value={v}>Bracket {v} — {label}</option>)}
            </select>
            <select value={maxCardPrice ?? ""} onChange={(e) => setMaxCardPrice(e.target.value ? Number(e.target.value) : null)}
              style={{ width: "auto" }} aria-label="Max price per card">
              <option value="">Any card price</option>
              {PRICE_CAPS.map((v) => <option key={v} value={v}>Up to {fmtUsd(v)} a card</option>)}
            </select>
          </div>

          {isDescribe ? (
            <>
              <p className="gen-lede">Commanders that fit “{describeText.trim()}”. Pick one and the deck is built around it.</p>
              {commanderChoices(generate)}
            </>
          ) : looking ? (
            <p className="muted small" role="status">Looking up the commander…</p>
          ) : chosen ? (
            // The choice the door is named for. Each button says what it calls.
            <div className="nd-chosen">
              <h2 className="gen-h2" style={{ marginTop: 0 }}>{commanderDisplay(cmdr)}</h2>
              <div className="nd-choice">
                <button className="primary nd-choice-btn" onClick={() => generate(chosen)} disabled={creating}>
                  <b>Build the {100 - chosen.length} →</b>
                  <i>{AI}</i>
                </button>
                <button
                  className="nd-choice-btn"
                  disabled={creating}
                  onClick={() => create({ name: commanderDisplay(cmdr), format, decklist_text: assembleForStorage("", cmdr, "") })}
                >
                  <b>Start from scratch</b>
                  <i>{NO_AI}</i>
                </button>
              </div>
              <button className="ghost small" onClick={() => setChosen(null)} disabled={creating}>Pick another</button>
            </div>
          ) : (
            <>
              {!partnerFor && (
                <>
                  <label htmlFor="gen-cmd">Commander</label>
                  <input
                    id="gen-cmd"
                    value={cmdQuery}
                    onChange={(e) => { setCmdQuery(e.target.value); searchCommanders(e.target.value); }}
                    placeholder="Start typing… e.g. nethroi"
                    autoComplete="off"
                  />
                  {searching && <p className="muted small">Searching…</p>}
                </>
              )}
              {commanderChoices(setChosen, "Choose →", pick)}
              {candidates?.length === 0 && !searching && (
                <p className="muted small">No commander matched. Try a different name.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// A one-tap commander pick: its art and short name.
function CommanderChip({ name, onPick, disabled }) {
  const data = useCardImage(name);
  return (
    <button type="button" className="nd-chip" onClick={() => onPick(name)} disabled={disabled} title={name}>
      {data?.art_crop ? <img src={data.art_crop} alt="" /> : <span className="nd-chip-blank" />}
      {name.split(",")[0]}
    </button>
  );
}

// Second commander for a partner-capable pick. The backend search returns only
// legal partners for `first` (every CR 702.124 kind), same as CommanderInput.
// A Background can't lead alone, so it gets no solo button, and its pair lists
// the creature first (the deck's face in MyDecks and the avatar).
// `builds` is whether choosing here starts a build, which the buttons say.
function PartnerStep({ first, onBuild, onCancel, builds = true }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const q = query.trim();
  const shown = q.length < 2 ? null : results; // a short query hides stale results

  useEffect(() => {
    const mine = ++seq.current;
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      try {
        const r = await api.commanders(q, first.name);
        if (mine !== seq.current) return;
        setResults(r.results || []);
        setError("");
      } catch (e) {
        if (mine !== seq.current) return;
        setResults([]);
        setError(e.message === "Failed to fetch" ? "Server waking up — try again in a moment." : "Couldn't load partners.");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, first.name]);

  return (
    <div className="gen-partner">
      <p className="gen-lede"><strong>{first.name}</strong> can share the command zone.</p>
      <div className="row" style={{ gap: ".4rem" }}>
        {first.kind !== "background" && (
          <button className="primary" onClick={() => onBuild([first.name])}>{builds ? "Build solo →" : "Go solo →"}</button>
        )}
        <button className="ghost" onClick={onCancel}>Pick another</button>
      </div>
      <label htmlFor="gen-partner">Partner</label>
      <input id="gen-partner" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search partners for ${first.name}…`} autoComplete="off" />
      {shown?.length > 0 && (
        <div className="gen-candidates" role="listbox" aria-label="Partner choices">
          {shown.slice(0, 8).map((p) => (
            <button key={p.name} role="option" aria-selected="false" className="gen-candidate"
              onClick={() => onBuild(first.kind === "background" ? [p.name, first.name] : [first.name, p.name])}>
              <span className="gen-candidate-name">{p.name}</span>
              <span className="muted small">{p.type_line}</span>
              <span className="gen-candidate-go">{builds ? "Build the 98 →" : "Choose →"}</span>
            </button>
          ))}
        </div>
      )}
      {shown?.length === 0 && (
        <p className="muted small">{error || "No legal partner matched that name."}</p>
      )}
    </div>
  );
}

// No `onBack` while a build runs: a build can't be called back, and leaving by
// the bar is what saves its deck without opening it.
function GenHeader({ steps, stepIdx, pct, onBack }) {
  return (
    <div className="gen-head">
      {onBack && <button className="ghost small" onClick={onBack}>← Back</button>}
      <div className="gen-progress">
        <div className="gen-progress-row">
          <span className="gen-step">Step {stepIdx + 1} of {steps.length} — {steps[stepIdx]}</span>
          <span className="gen-pct">{pct}%</span>
        </div>
        <div className="gen-track"><div className="gen-fill" style={{ width: `${Math.max(pct, 2)}%` }} /></div>
      </div>
    </div>
  );
}
