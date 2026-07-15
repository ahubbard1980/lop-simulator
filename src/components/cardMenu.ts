import type { ActionInput } from '../engine/actions';
import type { CardInstance, PlayerId } from '../engine/types';
import type { ContextMenuItem } from '../engine/uiStore';
import { useUIStore } from '../engine/uiStore';

const OTHER_PLAYER: Record<PlayerId, PlayerId> = { p1: 'p2', p2: 'p1' };

/** Basic right-click actions available on any card, per BUILD_SPEC's global card interactions. */
export function buildCardMenuItems(card: CardInstance, viewer: PlayerId, dispatch: (a: ActionInput) => void): ContextMenuItem[] {
  const base = { player: viewer };
  return [
    {
      label: 'Put in play',
      onClick: () => dispatch({ ...base, type: 'MOVE_CARD', cardId: card.id, toZone: 'field', toOwner: card.owner }),
    },
    {
      label: 'Put in Dustrealm',
      onClick: () => dispatch({ ...base, type: 'MOVE_CARD', cardId: card.id, toZone: 'dustrealm', toOwner: card.owner }),
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
}
