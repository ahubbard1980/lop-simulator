import { useUIStore } from '../engine/uiStore';
import { useSettingsStore } from '../engine/settingsStore';
import { useGameStore } from '../engine/store';
import { useMultiplayerStore } from '../net/multiplayerStore';
import { useAuthStore } from '../net/authStore';
import { restartNetGame } from '../net/matchHandshake';

export function SettingsModal() {
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const topColor = useSettingsStore((s) => s.topColor);
  const bottomColor = useSettingsStore((s) => s.bottomColor);
  const setColor = useSettingsStore((s) => s.setColor);
  const resetColors = useSettingsStore((s) => s.resetColors);
  const leaveGame = useGameStore((s) => s.leaveGame);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const roomId = useMultiplayerStore((s) => s.roomId);
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
              // Online: reset the board in place for both players — same
              // room, same code — rather than leaving back to the setup
              // screen, which is what this used to do regardless of mode.
              if (mySeat && roomId) {
                if (!window.confirm('Start a new game? This clears the board for both players.')) return;
                restartNetGame(roomId).catch((err: unknown) => {
                  alert(err instanceof Error ? err.message : 'Could not restart the match.');
                });
                close();
                return;
              }
              if (window.confirm('Start a new game? This clears the current board.')) {
                leaveGame();
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
