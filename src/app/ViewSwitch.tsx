import { VIEW_LABEL } from '../rank/medium';
import type { View } from '../types';
import type { AppState } from './useApp';

const VIEWS: View[] = ['anime', 'manga', 'both'];

/** Anime, manga or both: which titles the whole app shows. */
export function ViewSwitch({ app, compact = false }: { app: AppState; compact?: boolean }) {
  return (
    <div className={`segmented${compact ? ' view-switch' : ''}`} role="radiogroup" aria-label="Show anime, manga or both">
      {VIEWS.map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={app.view === v}
          className={app.view === v ? 'on' : ''}
          onClick={() => app.setSettings({ ...app.settings, view: v })}
        >
          {VIEW_LABEL[v]}
        </button>
      ))}
    </div>
  );
}
