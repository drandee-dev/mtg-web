"""The deck's theme reading: one pure function every AI call's deck context uses.

Audit job 3.1 (vault projects/mtg-web-audit-2026-11-25.md). The old "pre-computed,
trust this" block matched keywords anywhere in rules text, reminder text included,
so Sliver Gravemother read as "sacrifice, tokens" (its encore reminder) and Evolving
Wilds, Mind Stone and the sac-lands were protected as "sacrifice synergy". It knew no
creature types, so Optimize cut seven Slivers from a Sliver deck.

Card data only: no network, no bulk index. Input is Scryfall-shaped records.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

_REMINDER = re.compile(r"\([^)]*\)")
# A card paying with itself ("Sacrifice this land: ...") is not sacrifice synergy.
_SELF_SACRIFICE = re.compile(r"\bsacrifices? (?:this \w+|~|it)\b")
_TRIBE_SUPPORT = re.compile(r"\bcreature types?\b|\bchangeling\b")
# Named, at least this many deck cards of the type; else the deck's own majority type.
_NAMED_TRIBE_MIN = 5
_DECK_TRIBE_MIN = 8
# Half, not a third: Breena's precon has 10 incidental Humans in about 30 creatures.
_DECK_TRIBE_SHARE = 1 / 2
# shortcut: only the irregular plurals seen in Commander tribes; add one when a
# commander names a type this misses.
_PLURALS = {
    "elf": "elves",
    "dwarf": "dwarves",
    "wolf": "wolves",
    "werewolf": "werewolves",
    "mouse": "mice",
    "fungus": "fungi",
    "octopus": "octopuses",
}


@dataclass(frozen=True)
class Mechanic:
    key: str
    commander: str  # regex over the commander's text
    note: str
    card: str | None = None  # regex over "type line\ntext"; ^ anchors to the type line
    bucket: str | None = None


MECHANICS: tuple[Mechanic, ...] = (
    Mechanic(
        "mutate",
        r"\bmutates?\b",
        "MUTATE — all mutate creatures are core synergy pieces and mutate targets",
        r"\bmutates?\b",
        "Mutate synergy",
    ),
    Mechanic(
        "graveyard",
        r"\bgraveyard\b",
        "GRAVEYARD — cards that fill or interact with the graveyard are enablers",
        r"\bdredge\b|\bmills?\b|into (?:your|their|each player's) graveyard",
        "Graveyard filler",
    ),
    # Death triggers are as often one-shot ("When ~ dies") as repeatable.
    Mechanic(
        "death",
        r"\bdies\b",
        "DEATH TRIGGERS — the commander rewards creatures dying; expendable creatures "
        "and death-payoff cards are engine pieces",
        r"\bdies\b|\bdied\b|would die\b",
        "Death trigger / death payoff",
    ),
    Mechanic(
        "reanimator",
        r"return [^.\n]{0,60}from (?:your |a |the |target )?graveyard",
        "REANIMATOR — the graveyard is a resource; self-mill and cheap or low-power "
        "creatures are intentional reanimation targets, not weak cards",
        r"return [^.\n]{0,60}from (?:your |a |the |target )?graveyard|\breanimate\b",
        "Recursion/reanimation",
    ),
    Mechanic(
        "low_power",
        r"total power",
        "LOW-POWER CREATURES — the commander has a power restriction on reanimation, "
        "so low-power or */* creatures are INTENTIONALLY chosen",
    ),
    Mechanic(
        "casualty",
        r"\bcasualty\b",
        "CASUALTY — sacrificing a creature (power 1+) while casting an instant/sorcery "
        "copies that spell. Cheap/expendable creatures and token generators are FODDER, "
        "not weak cards — do not cut them. High-impact instants/sorceries are prime copy "
        "targets. Cards that grant afterlife, make tokens on death, or otherwise replenish "
        "sacrificed creatures directly support this engine and are core, not filler.",
        r"\bcasualty\b",
        "Sacrifice synergy",
    ),
    Mechanic(
        "sacrifice",
        r"\bsacrifices?\b",
        "SACRIFICE — sacrifice outlets and death triggers are part of the engine; "
        "expendable creatures and cards that recur or replace them are enablers, not weak cards",
        r"\bsacrifices?\b",
        "Sacrifice synergy",
    ),
    Mechanic(
        "afterlife",
        r"\bafterlife\b",
        "AFTERLIFE — dying creatures leave Spirit tokens behind; death triggers and "
        "sacrifice effects double-dip",
        r"\bafterlife\b",
        "Afterlife / death-value payoff",
    ),
    # Post-2024 cards say "When ~ enters," not "enters the battlefield".
    Mechanic(
        "etb",
        r"\benters(?: the battlefield)?\b",
        "ETB — creatures with enter-the-battlefield effects are value targets",
        r"^[^\n]*\bcreature\b[\s\S]*\bwhen(?:ever)? (?:~|this creature) enters",
        "Enters-the-battlefield value",
    ),
    Mechanic(
        "discover",
        r"\bdiscover\b|\bcascade\b",
        "DISCOVER — every discover or cascade hit is a free spell; cheap, high-impact "
        "nonland cards are the best hits and more discover/cascade cards are core",
        r"\bdiscover\b|\bcascade\b",
        "Discover/cascade",
    ),
    Mechanic(
        "blink",
        r"exile [^.\n]{0,60}return (?:it|that card|them|those cards) to the battlefield",
        "BLINK — exiling and returning creatures repeats their enter effects; blink "
        "spells and creatures with strong enter effects are the engine",
        r"exile [^.\n]{0,60}return (?:it|that card|them|those cards) to the battlefield",
        "Blink",
    ),
    Mechanic(
        "experience",
        r"experience counter",
        "EXPERIENCE — cards that trigger experience are core",
    ),
    Mechanic(
        "spells",
        r"\binstants?\b[^.\n]{0,30}\bsorcer|\bnoncreature spells?\b|\bmagecraft\b",
        "SPELLSLINGER — instants/sorceries fuel the commander",
        r"^[^\n]*\b(?:instant|sorcery)\b",
        "Instants and sorceries",
    ),
    Mechanic(
        "artifacts",
        r"\bartifacts? (?:you control|spells?)\b|(?:an|another) artifact "
        r"(?:you control )?enters|\bfor each artifact\b|\bcast an artifact\b",
        "ARTIFACTS — artifacts are the engine; artifact count matters",
        r"^[^\n]*\bartifact\b",
        "Artifacts",
    ),
    Mechanic(
        "enchantments",
        r"\benchantments? (?:you control|spells?)\b|(?:an|another) "
        r"enchantment (?:you control )?enters|\bconstellation\b|\bfor each enchantment\b"
        r"|\bcast an enchantment\b",
        "ENCHANTMENTS — enchantments are the engine; enchantment count matters",
        r"^[^\n]*\benchantment\b",
        "Enchantments",
    ),
    Mechanic(
        "voltron",
        r"\bequipped\b|\benchanted creature\b|\bequipment\b|\baura spells?\b"
        r"|\bauras? (?:you control|attached)\b",
        "VOLTRON — equipment and auras on the commander are the plan; protection for "
        "the commander is core",
        r"^[^\n]*\b(?:equipment|aura)\b",
        "Equipment and auras",
    ),
    Mechanic(
        "politics",
        r"\bgoad|\bmonarch\b|\bvotes?\b|\bvoting\b|\bone of your opponents\b"
        r"|\banother of your opponents\b|\bplayer with the most life\b",
        "POLITICS — the commander rewards opponents fighting each other; goad, monarch, "
        "voting and attack-redirect cards fit the plan",
        r"\bgoad|\bmonarch\b|\bvotes?\b|\bwill of the council\b|\bcan't attack you\b",
        "Politics",
    ),
    Mechanic(
        "tokens",
        r"\btokens?\b",
        "TOKENS — token generation supports the strategy",
        r"\bcreates?\b[^.\n]{0,80}\btokens?\b",
        "Token producer",
    ),
    Mechanic(
        "counters",
        r"\+1/\+1 counters?|\bproliferate\b",
        "COUNTERS — +1/+1 counter and proliferate cards synergize with the commander",
        r"\+1/\+1 counters?|\bproliferate\b",
        "Counters/proliferate synergy",
    ),
    Mechanic(
        "attacks",
        r"whenever [^.\n]{0,40}\battacks?\b",
        "ATTACK TRIGGERS — combat is the engine; haste, evasion, and extra-combat cards support it",
        r"\bhaste\b|additional combat",
        "Haste / extra combat",
    ),
    Mechanic(
        "lifegain",
        r"whenever you gain life|if you would gain life",
        "LIFEGAIN — life-gain triggers are payoffs; incidental lifegain cards are enablers",
        r"\bgains? [^.\n]{0,12}\blife\b|\blifelink\b",
        "Lifegain",
    ),
    Mechanic(
        "landfall",
        r"\blandfall\b|whenever a land [^.\n]{0,30}enters",
        "LANDFALL — extra land drops and land recursion fuel the commander",
        r"\blandfall\b|play an additional land|lands? cards? [^.\n]{0,30}onto the battlefield",
        "Land drops",
    ),
)
_LOW_POWER = "Low/variable power (reanimation target)"


def _names(rec: dict) -> list[str]:
    name = rec.get("name") or ""
    return [name, *name.split(" // ")] if " // " in name else [name]


def card_text(rec: dict | None) -> str:
    """Lowercased rules text of every face plus keywords, reminder text and
    self-sacrifice costs removed, the card's own name as "~"."""
    if not rec:
        return ""
    parts = [rec.get("oracle_text") or ""]
    parts += [f.get("oracle_text") or "" for f in rec.get("card_faces") or []]
    text = _REMINDER.sub("", "\n".join(p for p in parts if p))
    for n in sorted(_names(rec), key=len, reverse=True):
        if n:
            text = text.replace(n, "~")
    text = _SELF_SACRIFICE.sub("", text.lower())
    return f"{text} {' '.join(rec.get('keywords') or []).lower()}"


def creature_types(rec: dict) -> set[str]:
    """Subtypes of every creature or kindred face, lowercased."""
    out: set[str] = set()
    for face in (rec.get("type_line") or "").split(" // "):
        main, _, subs = face.partition("—")
        if re.search(r"\b(?:creature|kindred|tribal)\b", main, re.IGNORECASE):
            out.update(s.lower() for s in subs.split())
    return out


def _changeling(rec: dict) -> bool:
    return "Changeling" in (rec.get("keywords") or [])


def _type_word(t: str) -> str:
    plural = _PLURALS.get(t, t + "s")
    # "non-Human" names every type but that one. shortcut: a hate line ("Whenever a
    # Human deals damage to you", Mikaeus) still names it; fix if such a deck misreads.
    return rf"(?<!non-)\b(?:{re.escape(t)}|{re.escape(plural)})\b"


@dataclass
class Theme:
    tribe: str | None = None
    tribe_named: bool = False  # True when a commander's text names it
    # Cards of the tribe's type (changelings and Kindred spells included); the
    # tribe role also holds the cards that make or support them.
    tribe_creatures: int = 0
    mechanics: list[Mechanic] = field(default_factory=list)
    roles: dict[str, list[str]] = field(default_factory=dict)
    _pats: dict[str, re.Pattern] = field(default_factory=dict, repr=False)
    _commanders: set[str] = field(default_factory=set, repr=False)

    def on_tribe(self, rec: dict) -> bool:
        if not self.tribe:
            return False
        return (
            self.tribe in creature_types(rec)
            or _changeling(rec)
            or bool(_TRIBE_SUPPORT.search(card_text(rec)))
            or bool(re.search(_type_word(self.tribe), card_text(rec)))
        )

    def tribe_plural(self) -> str:
        """ "Slivers", "Elves": how a sentence names the tribe."""
        t = self.tribe or ""
        return _PLURALS.get(t, t + "s").title()

    def reasons(self, rec: dict | None) -> set[str]:
        """Why the card is on theme: "commander", "tribe" and/or mechanic keys."""
        if not rec:
            return set()
        out = {"commander"} if rec.get("name") in self._commanders else set()
        if self.on_tribe(rec):
            out.add("tribe")
        target = f"{(rec.get('type_line') or '').lower()}\n{card_text(rec)}"
        return out | {k for k, p in self._pats.items() if p.search(target)}

    def on_theme(self, rec: dict | None) -> bool:
        """The card is the tribe, supports it, or fills a mechanic the commander cares about."""
        return bool(self.reasons(rec))

    def keeps_theme(self, old: dict, new: dict) -> bool:
        """May `new` replace `old` without leaving the theme? A tribe card needs a
        tribe card (Apex Altisaur's swap must be a Dinosaur, not any enters-effect
        creature); a mechanic card needs one sharing a mechanic; an off-theme card
        takes anything."""
        why = self.reasons(old) - {"commander"}
        if not why:
            return True
        if "tribe" in why:
            return "tribe" in self.reasons(new)
        return bool(why & self.reasons(new))

    def summary(self) -> list[dict]:
        """For the page (audit job 6.1): one group per theme role, the tribe first.
        `count` is every card in the group; the tribe's `creatures` is how many of
        those are creatures of the type (the rest make or support them)."""
        tribe_key = f"{self.tribe.title()} tribe" if self.tribe else None
        return [
            {
                "label": self.tribe_plural() if k == tribe_key else k,
                "count": len(v),
                "creatures": self.tribe_creatures if k == tribe_key else None,
            }
            for k, v in self.roles.items()
        ]

    def tag(self, rec: dict | None) -> str | None:
        """A suggestion row's theme label: the tribe's name, "On theme", or None."""
        why = self.reasons(rec) - {"commander"}
        if "tribe" in why and self.tribe:
            return self.tribe.title()
        return "On theme" if why else None

    def prompt_text(self) -> str:
        out = ["\n## Theme reading (from card data)"]
        if self.tribe:
            how = (
                "the commander names it"
                if self.tribe_named
                else "most of the deck's creatures"
            )
            out.append(
                f"Tribe: {self.tribe.title()} ({how}). Creatures of this type and cards that "
                "support a creature type (choose a creature type, changelings) are the deck's core."
            )
        if self.mechanics:
            out.append(
                "Commander cares about: " + "; ".join(m.note for m in self.mechanics)
            )
        if self.roles:
            out.append("Key synergy roles in this deck:")
            for role, cards in self.roles.items():
                out.append(f"  - {role} ({len(cards)}): {', '.join(cards[:10])}")
            out.append(
                "DO NOT suggest cutting cards that fill these synergy roles unless the deck "
                "has excess redundancy in that specific role."
            )
        return "\n".join(out) if len(out) > 1 else ""


def _pick_tribe(commanders: list[dict], cards: list[dict]) -> tuple[str | None, bool]:
    # Changelings count toward a named type only: in the majority count they'd tie every type.
    counts = Counter(t for rec in cards for t in creature_types(rec))
    changelings = sum(1 for r in cards if _changeling(r))
    cmd_text = " ".join(card_text(c) for c in commanders)
    vocab = set(counts) | {t for c in commanders for t in creature_types(c)}
    named = [t for t in vocab if re.search(_type_word(t), cmd_text)]
    named = [t for t in named if counts[t] + changelings >= _NAMED_TRIBE_MIN]
    if named:
        return max(named, key=lambda t: (counts[t], t)), True
    creatures = sum(1 for r in cards if creature_types(r))
    if counts and creatures:
        t, n = max(counts.items(), key=lambda kv: (kv[1], kv[0]))
        if n >= _DECK_TRIBE_MIN and n >= creatures * _DECK_TRIBE_SHARE:
            return t, False
    return None, False


def read_theme(commanders: list[dict], cards: list[dict]) -> Theme:
    """Theme of a deck. `commanders` are the commander records, `cards` every record
    in the deck (commanders included); missing cards are skipped by the caller."""
    tribe, named = _pick_tribe(commanders, cards)
    cmd_text = " ".join(card_text(c) for c in commanders)
    mechanics = [m for m in MECHANICS if re.search(m.commander, cmd_text)]
    theme = Theme(
        tribe=tribe,
        tribe_named=named,
        mechanics=mechanics,
        _pats={m.key: re.compile(m.card) for m in mechanics if m.card},
        _commanders={c.get("name") for c in commanders},
    )
    roles: dict[str, list[str]] = {}
    if tribe:
        roles[f"{tribe.title()} tribe"] = [
            r["name"] for r in cards if theme.on_tribe(r)
        ]
        theme.tribe_creatures = sum(
            1 for r in cards if tribe in creature_types(r) or _changeling(r)
        )
    low_power = any(m.key in ("low_power", "reanimator") for m in mechanics)
    for rec in cards:
        target = f"{(rec.get('type_line') or '').lower()}\n{card_text(rec)}"
        for m in mechanics:
            if (
                m.card
                and m.bucket
                and rec["name"] not in roles.get(m.bucket, ())
                and re.search(m.card, target)
            ):
                roles.setdefault(m.bucket, []).append(rec["name"])
        if low_power and rec.get("power") in ("0", "*", "X"):
            roles.setdefault(_LOW_POWER, []).append(rec["name"])
    theme.roles = {k: v for k, v in roles.items() if v}
    return theme
