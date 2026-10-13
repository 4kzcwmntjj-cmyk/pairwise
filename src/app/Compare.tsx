import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { compareLists, MIN_RANKED, placeList, type Placed } from '../rank/compare';
import { decodeList, type SentList } from '../rank/listLink';
import { compareCards, namesFor } from './compareCards';
import { Cover } from './Cover';
import { fromSharedCards, possessive, viewNoun } from './page';
import { PictureButton, drawCard } from './ShareButtons';
import { SendList } from './SendList';
import { FindCard } from './Stats';
import type { AppState, Friend } from './useApp';

const sentOn = (made?: string) =>
  made ? new Date(`${made}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
const friendLabel = (f: Friend) => f.name ?? `Page sent ${sentOn(f.made) ?? 'without a name'}`;

/**
 * A person's page, from a link they sent: their top 10, how your lists compare, their Taste cards as they see
 * them, and the rest of their ranking. With `self`, your own page as a friend would see it. Also where friends'
 * pages are kept and links are pasted.
 */
export function Compare({
  app,
  initialKey,
  at,
  self,
  onClose,
  onStart,
  onOpen,
  onPreview,
}: {
  app: AppState;
  initialKey?: string;
  /** A card to scroll to on opening. */
  at?: string;
  /** Your own page, shown as a friend would see it. */
  self?: SentList;
  onClose: () => void;
  onStart: () => void;
  onOpen: (id: string) => void;
  onPreview: (page: SentList) => void;
}) {
  const [key, setKey] = useState(initialKey);
  useEffect(() => {
    if (initialKey) setKey(initialKey);
  }, [initialKey]);
  const friend: SentList | null = self ?? app.friends.find((f) => f.key === key) ?? app.friends[0] ?? null;
  const stored = self ? null : (friend as Friend | null);
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const ranked = app.fullOrder.length;
  const fresh = app.allMarks.size === 0 && app.votes.length === 0;
  const names = namesFor(friend?.name);
  // Your own page uses the name a friend will see.
  const whose = friend?.name ? possessive(friend.name) : self ? 'Your' : 'Their';

  const placed = useMemo(() => (friend ? placeList(friend.entries, (e) => app.itemOfEntry.get(e)) : null), [friend, app.itemOfEntry]);
  const result = useMemo(
    () => (!self && friend && placed && ranked >= MIN_RANKED ? compareLists(app.fullOrder, placed.placed, friend.entries.length) : null),
    [self, friend, placed, ranked, app.fullOrder],
  );
  // Only the match: their top 10 sits just above, with what you haven't ranked marked on it.
  const match = useMemo(() => (result ? compareCards(result, names).filter((c) => c.id === 'match') : []), [result, names.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const taste = useMemo(() => (friend?.cards ? fromSharedCards(friend.cards, app.itemOfEntry) : []), [friend, app.itemOfEntry]);

  // Open at the card the link pointed to, once it is on screen.
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!at || scrolled.current === at) return;
    const el = document.getElementById(`card-${at}`);
    if (!el) return;
    scrolled.current = at;
    el.scrollIntoView({ block: 'start' });
  }, [at, taste]);
  useEffect(() => {
    if (!at) window.scrollTo(0, 0);
  }, [key, self, at]);

  async function openPasted() {
    setPasteNote(null);
    const text = pasted.trim();
    const hash = text.includes('#') ? text.slice(text.indexOf('#')) : text;
    const list = decodeList(hash);
    if (!list) return setPasteNote("That doesn't look like a Shōbu link.");
    const k = await app.addFriend(list);
    setKey(k);
    setPasted('');
    window.scrollTo(0, 0);
  }

  const fullRank = useMemo(() => new Map(app.fullOrder.map((id, i) => [id, i + 1])), [app.fullOrder]);
  /** What you think of one of their titles, for the line under it. */
  const yours = (id: string): string | null => {
    if (self || fresh) return null;
    const r = fullRank.get(id);
    if (r) return `You #${r}`;
    return app.allMarks.get(id)?.status === 'unseen' ? "You haven't seen it" : 'Not on your list';
  };
  const row = (p: Placed) => {
    const item = app.itemById.get(p.id);
    if (!item) return null;
    const title = app.title(item);
    const mine = yours(p.id);
    return (
      <li key={p.id}>
        <button className="rank-row" onClick={() => onOpen(p.id)}>
          <span className="rank-num">{p.rank}</span>
          <Cover look={app.look(item)} title={title} size="sm" />
          <span className="rank-body">
            <span className="rank-title">{title}</span>
            <span className="rank-meta">
              {app.look(item).short}
              {mine && (
                <>
                  {' · '}
                  <span className={`nowrap${mine.startsWith('You #') ? ' page-yours' : ''}`}>{mine}</span>
                </>
              )}
            </span>
          </span>
        </button>
      </li>
    );
  };
  const theirTen = (placed?.placed ?? []).filter((p) => p.rank <= 10);
  const rest = (placed?.placed ?? []).filter((p) => p.rank > 10);
  const noun = viewNoun(friend?.view);

  const section = (title: string, body: ReactNode, cls = '') => (
    <section className={`page-section ${cls}`}>
      <h3>{title}</h3>
      {body}
    </section>
  );

  return (
    <main className="screen settings compare">
      <div className="action-row start">
        <button className="btn btn-quiet btn-small btn-back" onClick={onClose}>
          Back
        </button>
      </div>

      {friend ? (
        <>
          <h2>{self ? 'Your page' : friend.name ? `${possessive(friend.name)} page` : "A friend's page"}</h2>
          <p className="hint">
            {self
              ? 'This is what a friend sees when they open your link.'
              : `${friend.entries.length.toLocaleString()} ${noun} ranked${friend.made ? `, sent ${sentOn(friend.made)}` : ''}.`}
            {placed && placed.missing > 0 &&
              ` ${placed.missing} of them ${placed.missing === 1 ? "isn't" : "aren't"} in your title list yet, so ${placed.missing === 1 ? "it's" : "they're"} left out.`}
          </p>

          {!self && app.friends.length > 1 && (
            <label className="field compare-pick">
              <span>Showing</span>
              <select
                value={stored?.key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setRemoving(false);
                }}
              >
                {app.friends.map((f) => (
                  <option key={f.key} value={f.key}>
                    {friendLabel(f)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {section(
            `${whose} top ${Math.min(10, theirTen.length) || 10}`,
            theirTen.length === 0 ? (
              <p className="hint">None of these titles are in your title list yet.</p>
            ) : (
              <ol className="rank-list">{theirTen.map(row)}</ol>
            ),
          )}

          {match.length > 0 && (
            <div className="find-cards">
              {match.map((c) => (
                <FindCard
                  key={c.id}
                  card={c}
                  app={app}
                  onOpen={onOpen}
                  actions={
                    <div className="action-row start">
                      <PictureButton
                        make={drawCard(c, app)}
                        drawKey={`${c.headline}|${c.lines.join('|')}`}
                        filename="shobu-match"
                        title={`${c.kicker}: ${c.headline}`}
                        label="Share as a picture"
                        onStatus={setStatus}
                      />
                    </div>
                  }
                />
              ))}
              {status && (
                <p className="hint" role="status">
                  {status}
                </p>
              )}
            </div>
          )}

          {!self && !result && (
            <section className="page-section">
              <p>
                Once you've ranked {MIN_RANKED} titles of your own, this page also shows how your lists compare.
                {ranked > 0 && ` You have ${ranked} so far.`}
              </p>
              <div className="action-row start">
                <button className="btn btn-primary" onClick={onStart}>
                  {fresh ? 'Rank your own' : 'Back to duels'}
                </button>
              </div>
            </section>
          )}

          {taste.length > 0 &&
            section(
              `${whose} Taste cards`,
              <div className="find-cards">
                <p className="hint">As {friend.name ?? (self ? 'you see them' : 'they see them')}{friend.name ? ' sees them' : ''} in Shōbu.</p>
                {taste.map((c) => (
                  <FindCard key={c.id} card={c} app={app} onOpen={onOpen} />
                ))}
              </div>,
              'page-taste',
            )}
          {!friend.cards && !self && (
            <p className="hint">This link is from an older version of Shōbu and holds only the ranking.</p>
          )}

          {rest.length > 0 && (
            <details className="more-detail page-rest">
              <summary>
                The rest of {friend.name ? possessive(friend.name) : self ? 'your' : 'their'} list ({rest.length.toLocaleString()} more)
              </summary>
              <div className="more-detail-body">
                <ol className="rank-list">{rest.map(row)}</ol>
              </div>
            </details>
          )}
          {!self && result && app.view !== 'both' && (
            <p className="hint">Your ranks here count anime and manga together, as in the Both view.</p>
          )}
        </>
      ) : (
        <>
          <h2>Friends</h2>
          <p>
            Send a friend the link to your page: your ranking and your Taste cards. When they open it, they see how your lists
            compare, and they can send theirs back.
          </p>
        </>
      )}

      {!self && (
        <section className="compare-send">
          <h3>{friend ? 'Send yours back' : 'Share my page'}</h3>
          {app.fit.order.length >= MIN_RANKED ? (
            <div className="action-row start">
              <button className="btn btn-primary" onClick={() => setSending(true)}>
                Share my page
              </button>
            </div>
          ) : (
            <p className="hint">Rank at least {MIN_RANKED} titles first{ranked > 0 ? ` (you have ${ranked})` : ''}.</p>
          )}
        </section>
      )}

      {!self && (
        <section className="compare-paste">
          <h3>Have a link from a friend?</h3>
          <p className="hint">
            Opening it in this browser brings it here. Your list stays in the browser you made it in, so in the Home Screen app,
            paste the link here.
          </p>
          <div className="search-form">
            <input
              id="paste-link"
              className="search"
              type="url"
              placeholder="Paste the link"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && pasted.trim() && openPasted()}
            />
            <button className="btn" disabled={!pasted.trim()} onClick={openPasted}>
              Open
            </button>
          </div>
          {pasteNote && <p className="error">{pasteNote}</p>}
        </section>
      )}

      {stored && (
        <section className="compare-remove">
          {removing ? (
            <div className="confirm">
              <p>Remove {stored.name ? possessive(stored.name) : 'this'} page from this device? Opening the link again brings it back.</p>
              <div className="action-row start">
                <button
                  className="btn btn-danger btn-small"
                  onClick={async () => {
                    await app.removeFriend(stored.key);
                    setKey(undefined);
                    setRemoving(false);
                  }}
                >
                  Remove
                </button>
                <button className="btn btn-small" onClick={() => setRemoving(false)}>
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-quiet btn-small" onClick={() => setRemoving(true)}>
              Remove this page
            </button>
          )}
        </section>
      )}

      {sending && <SendList app={app} onClose={() => setSending(false)} onPreview={(p) => { setSending(false); onPreview(p); }} />}
    </main>
  );
}
