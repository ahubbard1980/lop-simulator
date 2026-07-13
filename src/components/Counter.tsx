import { useState } from 'react';

interface CounterProps {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onSetExact: (value: number) => void;
}

// Left-click increments, right-click decrements; click-and-type sets an exact value.
export function Counter({ label, value, onIncrement, onDecrement, onSetExact }: CounterProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    const n = parseInt(draft, 10);
    if (!Number.isNaN(n)) onSetExact(n);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="counter-row">
        <span className="counter-label">{label}</span>
        <input
          className="counter-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="counter-row">
      <span className="counter-label">{label}</span>
      <span
        className="counter-value"
        onClick={onIncrement}
        onContextMenu={(e) => {
          e.preventDefault();
          onDecrement();
        }}
        onDoubleClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
      >
        {value}
      </span>
    </div>
  );
}
