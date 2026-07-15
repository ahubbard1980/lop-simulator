import { useMemo } from 'react';
import type { PlayerId } from '../engine/types';
import { useGameStore } from '../engine/store';
import { useUIStore } from '../engine/uiStore';
import { Hand } from './Hand';
import { LeylineRow } from './LeylineRow';
import { FieldZone } from './FieldZone';
import { PileZone } from './PileZone';
import { NexusLordPanel } from './NexusLordPanel';

interface PlayerAreaProps {
  player: PlayerId;
  isOpponent: boolean;
  /** Leyline ids that would be auto-exhausted to pay for the card currently
   * being dragged, if dropped right now — see Board.tsx. */
  pendingPaymentLeylineIds?: Set<string>;
}

export function PlayerArea({ player, isOpponent, pendingPaymentLeylineIds }: PlayerAreaProps) {
  const state = useGameStore((s) => s.state);
  const activeViewer = useUIStore((s) => s.activeViewer);
  const cards = useMemo(() => (state ? Object.values(state.cards).filter((c) => c.owner === player) : []), [state, player]);

  if (!state) return null;

  const byZone = (zone: string) => cards.filter((c) => c.zone === zone);
  const lordCard = byZone('nexusLord')[0];

  // mode:'hotseat' means two real players (currently only online matches
  // build this — see engine/initialState.ts buildInitialStateFromCardLists)
  // and only the active viewer's own hand is face up; goldfish is solo, p1
  // is always "you".
  const faceUp = state.mode === 'goldfish' ? player === 'p1' : player === activeViewer;

  // Two independent, simultaneously-visible flags — they can point at
  // different players at once (Initiative belongs to whoever started the
  // turn; the Action may have already passed via the manual Pass Action
  // button), so they get visually distinct treatments rather than sharing
  // one highlight class.
  const hasInitiative = state.initiative === player;
  const hasAction = state.actionHolder === player;
  const highlightClass = `${hasInitiative ? ' has-initiative' : ''}${hasAction ? ' has-action' : ''}`;

  return (
    <div className={`player-area${isOpponent ? ' player-area-opponent' : ''}${highlightClass}`}>
      <div className="pile-column">
        <PileZone player={player} zone="deck" cards={byZone('deck')} viewer={activeViewer} label="Deck" isOpponent={isOpponent} />
        <PileZone player={player} zone="dustrealm" cards={byZone('dustrealm')} viewer={activeViewer} label="Dustrealm" isOpponent={isOpponent} />
        <PileZone player={player} zone="banished" cards={byZone('banished')} viewer={activeViewer} label="Banished" isOpponent={isOpponent} />
      </div>

      <div className="main-column">
        <div className="field-row">
          <FieldZone player={player} cards={byZone('field')} viewer={activeViewer} isOpponent={isOpponent} />
        </div>
        <div className="leyline-row-wrap">
          <LeylineRow
            player={player}
            cards={byZone('leylineRow')}
            viewer={activeViewer}
            isOpponent={isOpponent}
            pendingPaymentLeylineIds={pendingPaymentLeylineIds}
          />
        </div>
        <div className="hand-row">
          <Hand player={player} cards={byZone('hand')} faceUp={faceUp} viewer={activeViewer} isOpponent={isOpponent} />
        </div>
      </div>

      <div className="lord-column">
        <NexusLordPanel player={player} card={lordCard} viewer={activeViewer} />
      </div>
    </div>
  );
}
