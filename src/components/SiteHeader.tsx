import { AccountMenu } from './AccountMenu';

interface SiteHeaderProps {
  /** Takes the place of the website header's external "Play Now" link —
   * here it's an internal navigation back to the setup/play screen, since
   * we're already inside the simulator (e.g. deep in the Deck Builder). */
  onPlayClick?: () => void;
}

// Mirrors LoP-Website's BaseLayout.astro header (same markup shape, same
// --gold/--gold-bright color values) so the two sites read as one product
// as a player moves between leylinesofpower.com and play.leylinesofpower.com.
// Kept in sync by hand, same as the color palette already is (see that
// repo's global.css comment) — there's no shared build between an Astro
// static site and this Vite/React app to import a real shared component from.
export function SiteHeader({ onPlayClick }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <a className="brand" href="https://leylinesofpower.com">
        <img src="/icons/lop-logo.png" alt="Leylines of Power" width={32} height={32} />
        <span>Leylines of Power</span>
      </a>
      <nav className="site-nav">
        <a className="nav-link" href="https://leylinesofpower.com/rules">Rules</a>
        <AccountMenu />
        {onPlayClick && (
          <button className="play-link btn-gold" onClick={onPlayClick}>
            Play Now
          </button>
        )}
      </nav>
    </header>
  );
}
