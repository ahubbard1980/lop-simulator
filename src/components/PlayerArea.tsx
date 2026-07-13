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
}

export function PlayerArea({ player, isOpponent }: PlayerAreaProps) {
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

  return (
    <div className={`player-area${isOpponent ? ' player-area-opponent' : ''}`}>
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
          <LeylineRow player={player} cards={byZone('leylineRow')} viewer={activeViewer} isOpponent={isOpponent} />
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
