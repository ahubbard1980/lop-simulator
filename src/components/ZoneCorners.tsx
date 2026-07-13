// Purely decorative viewfinder-style corner brackets that frame a zone,
// like the gold accents in the reference mockup. Absolutely positioned
// inside a `position: relative` (or absolute) parent; doesn't intercept
// pointer events so it never interferes with drag-and-drop.
export function ZoneCorners({ className }: { className?: string }) {
  return (
    <div className={`zone-corners${className ? ` ${className}` : ''}`} aria-hidden="true">
      <span className="zone-corner zone-corner-tl" />
      <span className="zone-corner zone-corner-tr" />
      <span className="zone-corner zone-corner-bl" />
      <span className="zone-corner zone-corner-br" />
    </div>
  );
}
