import { useEffect, useMemo, useState } from 'react';
import { compareLists, MIN_RANKED, placeList } from '../rank/compare';
import { decodeList, listLink } from '../rank/listLink';
import { renderCard } from './cardImage';
import type { CardSpec } from './cards';
import { compareCards, namesFor } from './compareCards';
import { Cover } from './Cover';
import { pageUrl, SendList } from './SendList';
import { SharePreview } from './SharePreview';
import { FindCard } from './Stats';
import type { AppState, Friend } from './useApp';

const sentOn = (made?: string) =>
  made ? new Date(`${made}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
const friendLabel = (f: Friend) => f.name ?? `List sent ${sentOn(f.made) ?? 'without a name'}`;

/**
 * Comparing your list with a friend's, from a link they sent. With 10 or more ranked titles of your own you
 * see the comparison; with fewer, their top 10 and a way into duels. Also where you send your own list.
 */
export function Compare({
  app,
  initialKey,
  onClose,
  onStart,
  onOpen,
}: {
  app: AppState;
  initialKey?: string;
  onClose: () => void;
  onStart: () => void;
  onOpen: (id: string) => void;
}) {
  const [key, setKey] = useState(initialKey);
  useEffect(() => {
    if (initialKey) setKey(initialKey);
  }, [initialKey]);
  const friend = app.friends.find((f) => f.key === key) ?? app.friends[0] ?? null;
  const [sending, setSending] = useState(false);
  const [sharing, setSharing] = useState<CardSpec | null>(null);
  const [removing, setRemoving] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const ranked = app.fullOrder.length;
  const fresh = app.allMarks.size === 0 && app.votes.length === 0;
  const names = namesFor(friend?.name);

  const placed = useMemo(() => (friend ? placeList(friend.entries, (e) => app.itemOfEntry.get(e)) : null), [friend, app.itemOfEntry]);
  const result = useMemo(
    () => (friend && placed && ranked >= MIN_RANKED ? compareLists(app.fullOrder, placed.placed, friend.entries.length) : null),
    [friend, placed, ranked, app.fullOrder],
  );
  const cards = useMemo(() => (result ? compareCards(result, names) : []), [result, names.name]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openPasted() {
    setPasteNote(null);
    const text = pasted.trim();
    const hash = text.includes('#') ? text.slice(text.indexOf('#')) : text;
    const list = decodeList(hash);
    if (!list) return setPasteNote("That doesn't look like a Shōbu list link.");
    const k = await app.addFriend(list);
    setKey(k);
    setPasted('');
    window.scrollTo(0, 0);
  }

  async function copyTheirLink() {
    if (!friend) return;
    try {
      await navigator.clipboard.writeText(listLink(pageUrl(), friend));
      setCopied('Link copied.');
    } catch {
      setCopied("Couldn't copy the link here.");
    }
  }

  const theirTen = (placed?.placed ?? []).filter((p) => p.rank <= 10);

  return (
    <main className="screen settings compare">
      <div className="action-row start">
        <button className="btn btn-quiet btn-small" onClick={onClose}>
          Back
        </button>
      </div>
      <h2>{friend?.name ? `Compare with ${friend.name}` : 'Compare with a friend'}</h2>

      {app.friends.length > 1 && (
        <label className="field compare-pick">
          <span>Comparing with</span>
          <select
            value={friend?.key}
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

      {friend && placed && (
        <p className="hint">
          {friend.name ? `${friend.name} has` : 'They have'} ranked {friend.entries.length.toLocaleString()}{' '}
          {friend.entries.length === 1 ? 'title' : 'titles'}
          {friend.made ? ` (link made ${sentOn(friend.made)})` : ''}.
          {placed.missing > 0 &&
            ` ${placed.missing} of them ${placed.missing === 1 ? "isn't" : "aren't"} in your title list yet, so ${placed.missing === 1 ? "it's" : "they're"} left out.`}
          {result && app.view !== 'both' && ' Ranks here count anime and manga together, as in the Both view.'}
        </p>
      )}

      {!friend && (
        <p>
          Send your list to a friend as a link. When they open it, they see how your rankings compare: a match score, what
          you both love and where you disagree most. If they send theirs back, you see the same here.
        </p>
      )}

      {result && (
        <div className="find-cards">
          {cards.map((c) => (
            <FindCard key={c.id} card={c} app={app} onOpen={onOpen} onShare={() => setSharing(c)} />
          ))}
        </div>
      )}

      {friend && !result && (
        <section className="compare-theirs">
          <h3>{friend.name ? `${friend.name}'s top 10` : 'Their top 10'}</h3>
          {theirTen.length === 0 ? (
            <p className="hint">None of their top 10 are in your title list yet.</p>
          ) : (
            <ol className="rank-list">
              {theirTen.map((p) => {
                const item = app.itemById.get(p.id);
                if (!item) return null;
                const title = app.title(item);
                return (
                  <li key={p.id}>
                    <button className="rank-row" onClick={() => onOpen(p.id)}>
                      <span className="rank-num">{p.rank}</span>
                      <Cover look={app.look(item)} title={title} size="sm" />
                      <span className="rank-body">
                        <span className="rank-title">{title}</span>
                        <span className="rank-meta">{app.look(item).short}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <p>
            Once you've ranked {MIN_RANKED} titles of your own, this page shows how your lists compare. You'll find it again
            under Ranking → Compare.{ranked > 0 && ` You have ${ranked} so far.`}
          </p>
          <div className="action-row start">
            <button className="btn btn-primary" onClick={onStart}>
              {fresh ? 'Start ranking' : 'Back to duels'}
            </button>
          </div>
          <p className="hint">
            Your list stays in the browser you made it in. If it's in another browser or the Home Screen app, copy this link and
            open it there; in the Home Screen app, paste it under Ranking → Compare.
          </p>
          <div className="action-row start">
            <button className="btn btn-small" onClick={copyTheirLink}>
              Copy link
            </button>
            {copied && (
              <span className="hint" role="status">
                {copied}
              </span>
            )}
          </div>
        </section>
      )}

      {(!friend || result) && (
      <section className="compare-send">
        <h3>{friend ? 'Send yours back' : 'Send my list'}</h3>
        {ranked >= MIN_RANKED ? (
          <div className="action-row start">
            <button className="btn btn-primary" onClick={() => setSending(true)}>
              Send my list
            </button>
          </div>
        ) : (
          <p className="hint">
            Rank at least {MIN_RANKED} titles first{ranked > 0 ? ` (you have ${ranked})` : ''}.
          </p>
        )}
      </section>
      )}

      <section className="compare-paste">
        <h3>Have a link from a friend?</h3>
        <p className="hint">Opening it in this browser brings it here. You can also paste it.</p>
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

      {friend && (
        <section className="compare-remove">
          {removing ? (
            <div className="confirm">
              <p>Remove {friend.name ? `${friend.name}'s` : 'this'} list from this device? Opening the link again brings it back.</p>
              <div className="action-row start">
                <button
                  className="btn btn-danger btn-small"
                  onClick={async () => {
                    await app.removeFriend(friend.key);
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
              Remove this list
            </button>
          )}
        </section>
      )}

      {sending && <SendList app={app} onClose={() => setSending(false)} />}
      {sharing && (
        <SharePreview
          title={`${sharing.kicker}: ${sharing.headline}`}
          filename={`shobu-compare-${sharing.id}`}
          make={async () => {
            const { blob, missing } = await renderCard(sharing, (id) => {
              const item = app.itemById.get(id);
              if (!item) return { title: id };
              const look = app.look(item);
              return { title: app.title(item), cover: look.coverLarge ?? look.cover, color: look.coverColor };
            });
            return { blob, note: missing ? `${missing} ${missing === 1 ? 'cover' : 'covers'} didn't load.` : undefined };
          }}
          onClose={() => setSharing(null)}
        />
      )}
    </main>
  );
}
