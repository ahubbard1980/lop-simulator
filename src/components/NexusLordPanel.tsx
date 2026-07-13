import type { CardInstance, PlayerId } from '../engine/types';
import { DraggableCard } from './DraggableCard';
import { DroppableZone } from './DroppableZone';
import { ZoneCorners } from './ZoneCorners';
import { zoneDropId } from './dnd';
import { useGameStore } from '../engine/store';
import { Counter } from './Counter';

interface NexusLordPanelProps {
  player: PlayerId;
  card: CardInstance | undefined;
  viewer: PlayerId;
}

export function NexusLordPanel({ player, card, viewer }: NexusLordPanelProps) {
  const dispatch = useGameStore((s) => s.dispatch);
  const playerState = useGameStore((s) => s.state?.players[player]);
  if (!playerState) return null;

  const adjust = (counter: 'health' | 'focus', delta: number) =>
    dispatch({ type: 'ADJUST_PLAYER_COUNTER', player: viewer, targetPlayer: player, counter, delta });
  const setExact = (counter: 'health' | 'focus', value: number) =>
    dispatch({ type: 'SET_PLAYER_COUNTER', player: viewer, targetPlayer: player, counter, value });

  return (
    <DroppableZone id={zoneDropId(player, 'nexusLord')} className="nexus-lord-panel">
      <div className="nexus-lord-name">{playerState.name}</div>
      {card && (
        <DraggableCard
          card={card}
          size="lg"
          dropTarget
          onClick={(e) => {
            e.preventDefault();
            dispatch({ type: 'FLIP_CARD', player: viewer, cardId: card.id, isFlipped: !card.isFlipped });
          }}
        />
      )}
      <div className="nexus-lord-counters">
        <ZoneCorners className="zone-corners-tight" />
        <Counter label="Health" value={playerState.health} onIncrement={() => adjust('health', 1)} onDecrement={() => adjust('health', -1)} onSetExact={(v) => setExact('health', v)} />
        <Counter label="Focus" value={playerState.focus} onIncrement={() => adjust('focus', 1)} onDecrement={() => adjust('focus', -1)} onSetExact={(v) => setExact('focus', v)} />
      </div>
    </DroppableZone>
  );
}
