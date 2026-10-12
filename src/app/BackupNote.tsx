import { AddToHome } from './AddToHome';
import type { AppState } from './useApp';

/** The backup reminder, shown in Duel's tip slot in place of any tip. */
export function BackupNote({ app }: { app: AppState }) {
  return (
    <div className="tip backup-tip" role="status">
      <p>
        <span className="note-label">Backup</span>
        {app.backup ? 'You have new sorting and duels since your last saved copy.' : 'Your list only exists in this browser so far.'} Save a
        copy so it can't be lost.
      </p>
      <div className="tip-actions">
        <button className="btn btn-primary btn-small" onClick={() => app.saveBackup()}>
          Save a copy
        </button>
        <AddToHome />
        <button className="btn btn-quiet btn-small" onClick={() => app.snoozeBackup()}>
          Not now
        </button>
      </div>
    </div>
  );
}
