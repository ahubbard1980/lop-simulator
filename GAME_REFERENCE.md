# Leylines of Power — Game Reference (for the simulator)

Context for building the LoP tabletop simulator. This is NOT the full rulebook — it's the subset a sandbox sim needs. The game is in active playtesting; rules WILL change, which is why the sim enforces nothing.

## The pitch
A 1v1 TCG. Each player is represented by a **Nexus Lord** (avatar card, starts in play). You win by reducing the enemy Nexus Lord's Life to 0, by them drawing from an empty deck, or by a card effect.

## Zones (each player has all of these)
- **Deck** — face-down draw pile. 50 cards constructed (40 limited).
- **Hand** — private. Opening hand: 6. Max hand size: 7 unless a card says otherwise.
- **Field** — Creatures, Champions, Ancients, Relics, Enchantments, and the Nexus Lord.
- **Leyline Row** — dedicated row for Leylines (resource cards), placed between hand and field.
- **Dustrealm** — face-up discard pile (the graveyard).
- **Banished Realm** — exile zone.

## Card types the sim will display
- **Creatures** — have Power/Toughness. **Enter play exhausted (tapped) by default**; some cards specify entering ready.
- **Champions / Ancients** — legendary creatures, one copy of a name on the field at a time.
- **Chants** — one-shot spells: Rituals (sorcery speed) and Incantations/Interrupts/Intervene (instant speed). Go to Dustrealm after resolving.
- **Enchantments** — Runes (global, sit on the field) and **Sigils (auras — attach to another card and move with it)**. **Ancient Enchantment** is a legendary, singleton variant (one copy on the field at a time, like Champions/Ancients).
- **Relics** — artifact-style permanents. **Ancient Relic** is a legendary, singleton variant; some print with a fixed affinity plus a "this can only be played if it shares an affinity with you" restriction, even on print waves otherwise associated with Prismatic.
- **Leylines** — resource cards. One played per turn normally. **Enter ready by default**; some specify entering exhausted. Tapped ("Channeled") for Resonance.
- **Nexus Lords** — double-faced: they can **Ascend** and flip to a more powerful back face.

## Resources & counters the sim must track
- **Health / Life** — per player, starts at 20. Displayed under the Nexus Lord.
- **Focus** — per player, starts at 0, bankable across turns. Spent on Nexus Lord Edicts/Ultimates. Displayed under the Nexus Lord.
- **Resonance** — ephemeral within-turn resource from tapping Leylines. Players track it mentally or the UI may offer an optional small counter; it is NOT persistent.
- **Card counters** — arbitrary named counters appear on cards: +1/+1, -1/-1, Blood, Ward, Adrenaline, and future types. Support generic labeled counters.

## Turn & Initiative model (current playtest version)
The game uses a **shared turn**: within each turn, players alternate taking single Actions (play a card, attack, use a Lord ability, pass). One player holds **Initiative** each turn (acts first); Initiative alternates between players every turn. The sim needs: a turn counter, an Initiative indicator showing who holds it, and a priority-agnostic sandbox — players sequence their own actions.
NOTE: older docs describe a sequential per-player turn structure (Resonance → Focus → Draw → Main → Combat → Second Main → End). The sandbox must not hard-code either model; both are played manually on the same board.

## States & behaviors cards exhibit (UI verbs)
- **Ready / Exhaust** — untapped / tapped, shown by 90° rotation. ("Channel" = exhausting a Leyline.)
- **Summon** — play a creature from hand. **Conjure** — create a token (sim needs token spawning).
- **Banish** — move to Banished Realm. Some banishes are face down or temporary ("until this leaves play").
- **Reconstruct / Resolve** — cards return from the Dustrealm to the field (drag from expanded Dustrealm view).
- **Reveal** — a card becomes publicly known: opponent's hand cards revealed by effects display face up; deck positions can be publicly known and display face up within the face-down deck view.
- **Ascend / Flip** — Nexus Lords (and some creatures) flip to a back face.
- **Attach** — Sigils attach to creatures/permanents and move with them.
- **Mill / Scry-like effects** — move top card(s) of deck to Dustrealm; look at and reorder top of deck.

## Terminology glossary (use these words in the UI, not MTG terms)
| LoP term | Rough MTG equivalent |
|---|---|
| Nexus Lord | Commander/avatar |
| Leyline | Land |
| Channel | Tap for mana |
| Resonance | Mana (ephemeral) |
| Focus | Bankable avatar resource (no equivalent) |
| Dustrealm | Graveyard |
| Banished Realm / Banish | Exile |
| Exhausted / Ready | Tapped / Untapped |
| Summon | Cast a creature |
| Conjure | Create a token |
| Chant (Ritual / Incantation) | Sorcery / Instant |
| Rune / Sigil | Global enchantment / Aura |
| Inflict damage | Deal damage |
| Soar | Flying |
| Steadfast | Vigilance-like |
| Ascend | Flip/transform |
| Initiative | Goes-first marker each shared turn |
| Edict / Ultimate | Nexus Lord activated abilities (cost Focus) |

## Affinities (the game's "colors" — useful for deck builder & UI theming)
Chaos, Corruption, Primal, Arcane, Divinity, Prismatic. Decks include the Nexus Lord's affinity plus up to one more (a "splash") — that cap applies to spells only; Leylines may be any affinity, unrestricted.
