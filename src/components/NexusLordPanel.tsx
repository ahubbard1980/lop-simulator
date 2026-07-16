import type { CardInstance, PlayerId } from '../engine/types';
import { DraggableCard } from './DraggableCard';
import { DroppableZone } from './DroppableZone';
import { ZoneCorners } from './ZoneCorners';
import { zoneDropId } from './dnd';
import { useGameStore } from '../engine/store';
import { Counter } from './Counter';
import { useFitScaleY } from './useFitScale';

interface NexusLordPanelProps {
  player: PlayerId;
  card: CardInstance | undefined;
  viewer: PlayerId;
}

export function NexusLordPanel({ player, card, viewer }: NexusLordPanelProps) {
  const dispatch = useGameStore((s) => s.dispatch);
  const playerState = useGameStore((s) => s.state?.players[player]);
  const hasAction = useGameStore((s) => s.state?.actionHolder === player);
  const turn = useGameStore((s) => s.state?.turn);
  const initiative = useGameStore((s) => s.state?.initiative);
  // Shrinks the whole name/card/counters/buttons stack (via CSS scale) to
  // fit .lord-column's actual height on a shorter viewport — .lord-column
  // is already scrollable as a fallback, but with its scrollbar hidden that
  // read as "New Turn is just gone" rather than "scroll to find it".
  const { contentRef, scale } = useFitScaleY<HTMLDivElement>([playerState?.health, playerState?.focus, hasAction, turn, initiative]);
  if (!playerState) return null;

  const adjust = (counter: 'health' | 'focus', delta: number) =>
    dispatch({ type: 'ADJUST_PLAYER_COUNTER', player: viewer, targetPlayer: player, counter, delta });
  const setExact = (counter: 'health' | 'focus', value: number) =>
    dispatch({ type: 'SET_PLAYER_COUNTER', player: viewer, targetPlayer: player, counter, value });

  return (
    <DroppableZone id={zoneDropId(player, 'nexusLord')} className="nexus-lord-panel">
      <div
        ref={contentRef}
        className="nexus-lord-panel-inner"
        style={scale !== 1 ? { transform: `scale(${scale})` } : undefined}
      >
        <div className="nexus-lord-name">{playerState.name}</div>
        {card && (
          <DraggableCard
            card={card}
            size="lg"
            dropTarget
            arrowButton
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
        <button
          className={`pass-action-btn${hasAction ? ' pass-action-btn-active' : ''}`}
          title="Pass the Action to the other player"
          onClick={() => dispatch({ type: 'PASS_ACTION', player: viewer })}
        >
          Pass Action
        </button>
        {/* Global, not per-player — only shown on the viewer's own panel so
            it doesn't render twice (once per mirrored side). */}
        {player === viewer && turn !== undefined && initiative !== undefined && (
          <button
            className="new-turn-btn"
            title="Advance the turn, hand Initiative to the other player, and ready all permanents"
            onClick={() =>
              dispatch({
                type: 'NEW_TURN',
                player: viewer,
                turn: turn + 1,
                targetPlayer: initiative === 'p1' ? 'p2' : 'p1',
              })
            }
          >
            New Turn ▸
          </button>
        )}
      </div>
    </DroppableZone>
  );
}
