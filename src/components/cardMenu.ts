import type { ActionInput } from '../engine/actions';
import type { CardInstance, PlayerId } from '../engine/types';
import type { ContextMenuItem } from '../engine/uiStore';
import { useUIStore } from '../engine/uiStore';
import { useGameStore } from '../engine/store';

const OTHER_PLAYER: Record<PlayerId, PlayerId> = { p1: 'p2', p2: 'p1' };

/** Basic right-click actions available on any card, per BUILD_SPEC's global card interactions. */
export function buildCardMenuItems(card: CardInstance, viewer: PlayerId, dispatch: (a: ActionInput) => void): ContextMenuItem[] {
  const base = { player: viewer };
  // A targeting/blocking arrow only *renders* clickable when both of its
  // endpoint cards are individually visible in the DOM — which stops being
  // true once one end gets moved into a pile and buried under other cards
  // (PileZone only renders its top card). This menu item is the fallback:
  // as long as one endpoint is still right-clickable (wherever it ended up),
  // the arrow can always be cleared from here regardless of whether it's
  // currently drawn on screen.
  const relatedArrowIds = Object.values(useGameStore.getState().state?.arrows ?? {})
    .filter((a) => a.fromCardId === card.id || a.toCardId === card.id)
    .map((a) => a.id);

  const items: ContextMenuItem[] = [
    {
      label: 'Put in play',
      onClick: () => dispatch({ ...base, type: 'MOVE_CARD', cardId: card.id, toZone: 'field', toOwner: card.owner }),
    },
    {
      label: 'Move to hand',
      onClick: () => dispatch({ ...base, type: 'MOVE_CARD', cardId: card.id, toZone: 'hand', toOwner: card.owner }),
    },
    {
      label: 'Put in Dustrealm',
      onClick: () => dispatch({ ...base, type: 'MOVE_CARD', cardId: card.id, toZone: 'dustrealm', toOwner: card.owner }),
    },
    {
      label: 'Move to Banished',
      onClick: () => dispatch({ ...base, type: 'MOVE_CARD', cardId: card.id, toZone: 'banished', toOwner: card.owner }),
    },
    {
      label: 'Reveal card',
      onClick: () => dispatch({ ...base, type: 'REVEAL_CARD', cardId: card.id, toPlayer: OTHER_PLAYER[card.owner] }),
    },
    {
      label: 'Add counter…',
      separatorBefore: true,
      onClick: () => {
        const name = window.prompt('Counter name?', 'counter');
        if (name) dispatch({ ...base, type: 'ADJUST_CARD_COUNTER', cardId: card.id, counter: name, delta: 1 });
      },
    },
    {
      label: 'Remove counter…',
      onClick: () => {
        const name = window.prompt('Counter name?', 'counter');
        if (name) dispatch({ ...base, type: 'ADJUST_CARD_COUNTER', cardId: card.id, counter: name, delta: -1 });
      },
    },
    {
      label: 'Add +1/+1 counter',
      onClick: () => dispatch({ ...base, type: 'ADJUST_CARD_COUNTER', cardId: card.id, counter: '+1/+1', delta: 1 }),
    },
    {
      label: 'Remove +1/+1 counter',
      onClick: () => dispatch({ ...base, type: 'ADJUST_CARD_COUNTER', cardId: card.id, counter: '+1/+1', delta: -1 }),
    },
    {
      label: 'Add -1/-1 counter',
      onClick: () => dispatch({ ...base, type: 'ADJUST_CARD_COUNTER', cardId: card.id, counter: '-1/-1', delta: 1 }),
    },
    {
      label: 'Remove -1/-1 counter',
      onClick: () => dispatch({ ...base, type: 'ADJUST_CARD_COUNTER', cardId: card.id, counter: '-1/-1', delta: -1 }),
    },
    {
      label: 'Make a token…',
      separatorBefore: true,
      onClick: () => useUIStore.getState().openTokenPicker(card.owner),
    },
    {
      label: 'Move to top of deck',
      separatorBefore: true,
      onClick: () => dispatch({ ...base, type: 'MOVE_TO_DECK', cardId: card.id, position: 'top' }),
    },
    {
      label: 'Move to bottom of deck',
      onClick: () => dispatch({ ...base, type: 'MOVE_TO_DECK', cardId: card.id, position: 'bottom' }),
    },
    {
      label: 'Shuffle into deck',
      onClick: () => dispatch({ ...base, type: 'MOVE_TO_DECK', cardId: card.id, position: 'shuffle' }),
    },
  ];

  if (relatedArrowIds.length > 0) {
    items.push({
      label: relatedArrowIds.length > 1 ? `Remove ${relatedArrowIds.length} arrows` : 'Remove arrow',
      separatorBefore: true,
      onClick: () => relatedArrowIds.forEach((arrowId) => dispatch({ ...base, type: 'REMOVE_ARROW', arrowId })),
    });
  }

  return items;
}
