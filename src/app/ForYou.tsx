import { useMemo, useState } from 'react';
import { lookOf } from '../rank/look';
import { MIN_RANKED, recommend, type Recommendation } from '../rank/recommend';
import { buildRows, dayNumber, tonightOrder, type RowPick, type SuggestionRow } from '../rank/rows';
import type { Item } from '../types';
import type { CardSpec } from './cards';
import { renderCard } from './cardImage';
import { Cover } from './Cover';
import { tonightCard } from './forYouCards';
import { SharePreview } from './SharePreview';
import type { AppState } from './useApp';

export function ForYou({ app, onOpen, onSort }: { app: AppState; onOpen: (id: string) => void; onSort: () => void }) {
  const [justHidden, setJustHidden] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [rerolls, setRerolls] = useState(0);
  const [sharing, setSharing] = useState<CardSpec | null>(null);
  const hiddenKeys = useMemo(() => new Set(app.dismissed), [app.dismissed]);
  const isHidden = (entryIds: number[]) => entryIds.some((e) => hiddenKeys.has(String(e)));
  const recs = useMemo(() => recommend(app.items, app.fit, app.marks, 400), [app.items, app.fit, app.marks]);
  const visible = useMemo(() => recs.filter((r) => !isHidden(r.item.entryIds)), [recs, hiddenKeys]);
  const shown = visible.slice(0, 50);
  const hidden = app.items.filter((i) => isHidden(i.entryIds) && app.marks.get(i.id)?.status !== 'seen');

  const language = app.settings.titleLanguage;
  const rows = useMemo(
    () =>
      buildRows({
        items: app.items,
        order: app.fit.order,
        recs: visible,
        isHidden: (i) => isHidden(i.entryIds),
        marks: app.marks,
        allItems: app.allItems,
        allMarks: app.allMarks,
        fullOrder: app.fullOrder,
        view: app.view,
        rankOf: app.rankOf,
        title: app.title,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.items, app.fit, visible, hiddenKeys, app.marks, app.allItems, app.allMarks, app.fullOrder, app.view, app.rankOf, language],
  );

  // Tonight's pick goes through a shuffle that stays the same for the day; Another moves to the next.
  const day = dayNumber(new Date());
  const order = useMemo(() => tonightOrder(visible, day), [visible, day]);
  const pick = order.length ? order[rerolls % order.length] : null;

  const hide = async (id: string) => {
    await app.dismiss(id, true);
    setJustHidden(id);
  };

  if (app.fit.order.length < MIN_RANKED) {
    return (
      <main className="screen empty">
        <h2>Nothing to go on yet</h2>
        <p>Mark a few titles as seen in the Library and do some duels. Suggestions come from the shows you rank highest.</p>
        <button className="btn btn-primary" onClick={onSort}>
          Go to the Library
        </button>
      </main>
    );
  }

  const name = (id: string) => {
    const it = app.itemById.get(id);
    return it ? `${app.title(it)} (#${app.rankOf.get(id)})` : '';
  };
  const reasonOf = ({ because, genres, tags }: Recommendation) =>
    because.length
      ? `Because you rank ${because.slice(0, 2).sort((x, y) => (app.rankOf.get(x) ?? 0) - (app.rankOf.get(y) ?? 0)).map(name).join(' and ')} highly`
      : tags.length
        ? `Tags you rank well: ${tags.slice(0, 3).join(', ')}`
        : `Genres you rank well: ${genres.slice(0, 3).join(', ')}`;

  return (
    <main className="screen for-you">
      {pick && (
        <article className="tonight">
          <p className="find-kicker">Tonight's pick</p>
          <div className="tonight-body">
            <button className="tonight-cover" onClick={() => onOpen(pick.item.id)} aria-label={`Open ${app.title(pick.item)}`}>
              <Cover look={app.look(pick.item)} title={app.title(pick.item)} size="md" />
            </button>
            <div className="tonight-text">
              <button className="tonight-title" onClick={() => onOpen(pick.item.id)}>
                {app.title(pick.item)}
              </button>
              <p className="rank-meta">{app.look(pick.item).meta}</p>
              <p className="rec-reason">{reasonOf(pick)}</p>
            </div>
          </div>
          <div className="action-row start">
            <button className="btn btn-primary btn-small" onClick={() => setRerolls(rerolls + 1)} disabled={order.length < 2}>
              Another
            </button>
            <button
              className="btn btn-small"
              onClick={() => setSharing(tonightCard(pick.item.id, app.title(pick.item), reasonOf(pick), app.look(pick.item).meta))}
            >
              Share
            </button>
            <button className="btn btn-quiet btn-small" onClick={() => hide(pick.item.id)}>
              Not interested
            </button>
          </div>
        </article>
      )}

      {rows.map((row) => (
        <RecRow key={row.id} row={row} app={app} onOpen={onOpen} onHide={hide} />
      ))}

      <section className="more-recs">
        <h3 className="row-heading">More suggestions</h3>
        <p className="hint">
          Titles you haven't logged as seen, from AniList users' recommendations for the shows you rank highest, and the
          genres and tags you rank well. They sharpen as your ranking settles.
        </p>
        {shown.length === 0 ? (
          <p className="empty-list">No suggestions yet. Rank a few more titles.</p>
        ) : (
          <ol className="rank-list">
            {shown.map((rec) => {
              const { item } = rec;
              const title = app.title(item);
              const status = app.marks.get(item.id)?.status;
              return (
                <li key={item.id} className="rec-item">
                  <button className="rank-row rec-row" onClick={() => onOpen(item.id)}>
                    <Cover look={app.look(item)} title={title} size="sm" />
                    <span className="rank-body">
                      <span className="rank-title">{title}</span>
                      <span className="rank-meta">{app.look(item).meta}</span>
                      <span className="rec-reason">{reasonOf(rec)}</span>
                    </span>
                    {status === 'unseen' && <span className="status-note">Logged as not seen</span>}
                  </button>
                  <button className="btn btn-quiet btn-small rec-hide" onClick={() => hide(item.id)}>
                    Not interested
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {justHidden && app.itemById.get(justHidden) && (
        <p className="toast" role="status">
          Hidden {app.title(app.itemById.get(justHidden)!)}.{' '}
          <button
            className="btn btn-quiet btn-small"
            onClick={async () => {
              await app.dismiss(justHidden, false);
              setJustHidden(null);
            }}
          >
            Undo
          </button>
        </p>
      )}
      {hidden.length > 0 && (
        <section className="hidden-recs">
          <button className="btn btn-quiet btn-small" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? 'Hide the list' : `Hidden suggestions (${hidden.length})`}
          </button>
          {showHidden && (
            <ul className="op-list">
              {hidden.map((i) => (
                <li key={i.id}>
                  <span>{app.title(i)}</span>
                  <button className="btn btn-quiet btn-small" onClick={() => app.dismiss(i.id, false)}>
                    Show again
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {sharing && (
        <SharePreview
          title={`${sharing.kicker}: ${sharing.headline}`}
          filename="shobu-tonights-pick"
          make={async () => {
            const { blob, missing, details } = await renderCard(sharing, (id) => {
              const item = app.itemById.get(id);
              if (!item) return { title: id };
              const look = app.look(item);
              return { title: app.title(item), cover: look.coverLarge ?? look.cover, color: look.coverColor };
            });
            return { blob, note: missing ? `${missing} ${missing === 1 ? 'cover' : 'covers'} didn't load.` : undefined, details };
          }}
          onClose={() => setSharing(null)}
        />
      )}
    </main>
  );
}

/** One swipeable row of covers with a heading. */
function RecRow({ row, app, onOpen, onHide }: { row: SuggestionRow; app: AppState; onOpen: (id: string) => void; onHide: (id: string) => void }) {
  return (
    <section className="rec-block" aria-label={row.heading}>
      <h3 className="row-heading">{row.heading}</h3>
      <ul className="rec-strip">
        {row.picks.map((p) => (
          <RecCard key={p.item.id} pick={p} kind={row.kind} app={app} onOpen={onOpen} onHide={onHide} />
        ))}
      </ul>
    </section>
  );
}

function RecCard({ pick, kind, app, onOpen, onHide }: { pick: RowPick; kind: SuggestionRow['kind']; app: AppState; onOpen: (id: string) => void; onHide: (id: string) => void }) {
  const { item } = pick;
  const title = app.title(item);
  // The manga and anime rows show the form you haven't tried; the others show the side you know.
  const look = kind === 'manga' || kind === 'anime' ? lookOf(item, kind) : app.look(item);
  const note = pick.note ?? look.short;
  return (
    <li className="rec-card">
      <button className="rec-card-open" onClick={() => onOpen(item.id)} aria-label={note ? `${title}, ${note}` : title}>
        <Cover look={look} title={title} size="lg" />
        <span className="rec-card-title">{title}</span>
        {note && <span className="rec-card-note">{note}</span>}
      </button>
      {/* A title you've seen can't be hidden: it would drop out of the Hidden list, so the manga and anime rows have no button. */}
      {(kind === 'because' || kind === 'gems') && <HideButton item={item} title={title} onHide={onHide} />}
    </li>
  );
}

function HideButton({ item, title, onHide }: { item: Item; title: string; onHide: (id: string) => void }) {
  return (
    <button className="rec-card-hide" onClick={() => onHide(item.id)} aria-label={`Not interested in ${title}`}>
      <span aria-hidden="true">×</span>
    </button>
  );
}
