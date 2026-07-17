import { useUIStore } from '../engine/uiStore';
import { useSettingsStore } from '../engine/settingsStore';
import { useGameStore } from '../engine/store';
import { useMultiplayerStore } from '../net/multiplayerStore';
import { useAuthStore } from '../net/authStore';

export function SettingsModal() {
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const topColor = useSettingsStore((s) => s.topColor);
  const bottomColor = useSettingsStore((s) => s.bottomColor);
  const setColor = useSettingsStore((s) => s.setColor);
  const resetColors = useSettingsStore((s) => s.resetColors);
  const leaveGame = useGameStore((s) => s.leaveGame);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const user = useAuthStore((s) => s.user);

  if (!settingsOpen) return null;

  const close = () => setSettingsOpen(false);

  return (
    <div className="zone-overlay-backdrop" onClick={close}>
      <div className="zone-overlay settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="zone-overlay-header">
          <span>Settings</span>
          <button onClick={close}>Close</button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Play area colors</div>
          <div className="settings-row">
            <label>Opponent side (top)</label>
            <input type="color" value={topColor} onChange={(e) => setColor('topColor', e.target.value)} />
          </div>
          <div className="settings-row">
            <label>Your side (bottom)</label>
            <input type="color" value={bottomColor} onChange={(e) => setColor('bottomColor', e.target.value)} />
          </div>
          <button className="settings-reset" onClick={resetColors}>Reset to default colors</button>
          <div className="settings-hint">
            {user ? `Synced to your account (${user.email})` : 'Sign in from the Deck Builder to sync these across devices'}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Game</div>
          <button
            className="settings-danger"
            onClick={() => {
              if (window.confirm('Start a new game? This clears the current board.')) {
                if (mySeat) useMultiplayerStore.getState().leaveNetGame();
                else leaveGame();
                close();
              }
            }}
          >
            Start New Game
          </button>
        </div>
      </div>
    </div>
  );
}
