import { themeTags } from '../rank/findings';
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  MIN_DUELS_FOR_TASTE,
  MIN_RANKED_FOR_CROWD,
  MIN_RANKED_FOR_TASTE,
  crowdView,
  decadeOf,
  duelStats,
  enoughForTaste,
  extremes,
  history,
  mainstream,
  movers,
  overview,
  settledBands,
  tasteBy,
  topSpell,
  type HistoryPoint,
  type HotTake,
  type TasteGroup,
} from '../rank/stats';
import type { Item } from '../types';
import { Cover } from './Cover';
import { withLook, type Look } from '../rank/look';
import type { AppState } from './useApp';
import { buildCards, CARD_HUES, type CardSpec } from './cards';
import { renderCard } from './cardImage';
import { SharePreview } from './SharePreview';
import { wrapLines } from './shareImage';

const shortDate = (at: number | string) => {
  const d = typeof at === 'string' ? new Date(`${at}T12:00:00`) : new Date(at);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const n = (x: number) => x.toLocaleString();

let lastCatalogue: { items: Item[]; look: AppState['look']; out: Item[] } | null = null;
/**
 * Every title in the view as you know it. Kept between visits to Taste: it only changes with the view or your
 * marks, and keeping the same array lets the type card's base rates (kept per array) carry over too.
 */
function lookedCatalogue(items: Item[], look: AppState['look']): Item[] {
  if (lastCatalogue?.items === items && lastCatalogue.look === look) return lastCatalogue.out;
  const out = items.map((i) => withLook(i, look(i)));
  lastCatalogue = { items, look, out };
  return out;
}

export function Stats({ app, onOpen }: { app: AppState; onOpen: (id: string) => void }) {
  const { fit, votes, marks } = app;

  // Titles that have played at least one duel, best first. Unplayed ones sit at the midpoint and would blur the groups.
  const ranked: Item[] = useMemo(
    () =>
      fit.order
        .filter((id) => (fit.duels.get(id) ?? 0) > 0)
        .map((id) => app.itemById.get(id)!)
        .filter(Boolean)
        // Years, studio and AniList score of the side you know: in the manga view, the manga's.
        .map((i) => withLook(i, app.look(i))),
    [fit, app.itemById, app.look],
  );
  // The fit runs over everything you've seen; ranks are counted within the current view.
  const seenIds = app.seenIds;
  const within = useMemo(() => new Set(fit.order), [fit]);
  const now = useMemo(() => Date.now(), [votes]);

  const over = useMemo(() => overview(votes, marks, now), [votes, marks, now]);
  const top10 = useMemo(() => ranked.slice(0, 10).map((i) => i.id), [ranked]);
  const points = useMemo(() => history(votes, seenIds, top10, 12, within), [votes, seenIds, top10, within]);
  const week = useMemo(() => movers(votes, seenIds, now - 7 * 86_400_000, 3, 30, within), [votes, seenIds, now, within]);
  const unlocked = enoughForTaste(ranked.length, votes.length);
  const taste = useMemo(() => {
    if (!unlocked) return null;
    const pick = (keys: (i: Item) => string[], min: number) => extremes(tasteBy(ranked, keys, min));
    return {
      genres: pick((i) => i.genres ?? [], 5),
      tags: pick(themeTags, 5),
      studios: pick((i) => (i.studio ? [i.studio] : []), 3),
      decades: pick(decadeOf, 4),
    };
  }, [unlocked, ranked]);
  const crowd = useMemo(() => crowdView(ranked), [ranked]);
  const main = useMemo(() => mainstream(app.items, marks), [app.items, marks]);
  const duels = useMemo(() => duelStats(votes, fit.order), [votes, fit.order]);
  const bands = useMemo(() => settledBands(fit), [fit]);
  // How long the title at #1 has held the top spot: a replay of the votes, so only when there are cards to show.
  const spell = useMemo(
    () => (ranked.length >= 10 ? topSpell(votes, seenIds, ranked[0].id, now, within) : null),
    [ranked, votes, seenIds, now, within],
  );
  const noun = app.view === 'both' ? 'titles' : app.view;
  // Every title in the view, as you know it: the base for "typical" and popularity positions.
  const catalogue = useMemo(() => lookedCatalogue(app.items, app.look), [app.items, app.look]);
  const cards = useMemo(
    () =>
      ranked.length < 10
        ? []
        : buildCards({
            ranked,
            catalogue,
            marks,
            votes,
            order: fit.order,
            crowd,
            tieShare: over.tieShare,
            enoughForType: unlocked,
            noun,
            week,
            topSpell: spell,
            undefeated: duels.undefeated[0] ?? null,
            title: (id) => {
              const item = app.itemById.get(id);
              return item ? app.title(item) : id;
            },
          }),
    [ranked, catalogue, marks, votes, fit.order, crowd, over.tieShare, unlocked, noun, week, spell, duels, app.itemById, app.title],
  );
  const [sharing, setSharing] = useState<CardSpec | null>(null);

  if (votes.length === 0) {
    return (
      <main className="screen stats">
        <div className="empty">
          <h2>Nothing to show yet</h2>
          <p>Taste is built from your duels. Play a few and they will appear here.</p>
        </div>
      </main>
    );
  }

  const title = (id: string) => {
    const item = app.itemById.get(id);
    return item ? app.title(item) : id;
  };
  const rankOf = new Map(fit.order.map((id, i) => [id, i + 1]));
  const row = (id: string, meta: ReactNode) => <TitleRow key={id} id={id} meta={meta} app={app} onOpen={onOpen} />;
  const moves = (list: { id: string; from: number; to: number }[], up: boolean) =>
    list.length > 0 && (
      <ol className="rank-list">
        {list.map((m) => (
          <li key={m.id}>{row(m.id, `${up ? '▲' : '▼'} ${Math.abs(m.from - m.to)} (#${m.from} to #${m.to})`)}</li>
        ))}
      </ol>
    );
  /** Two titles side by side as rank rows, with what happened between them underneath. */
  const pair = (a: string, b: string, aMeta: ReactNode, bMeta: ReactNode, note: ReactNode) => (
    <li key={`${a}|${b}`} className="pair-rows">
      {row(a, aMeta)}
      {row(b, bMeta)}
      <p className="hint">{note}</p>
    </li>
  );
  const recordCount = duels.upsets.length + duels.rivalries.length + duels.undefeated.length + duels.winless.length;

  return (
    <main className="screen stats">
      {!unlocked && <Unlock ranked={ranked.length} duels={votes.length} />}
      {cards.length > 0 && (
        <div className="find-cards">
          {cards.map((c) => (
            <FindCard key={c.id} card={c} app={app} onOpen={onOpen} onShare={() => setSharing(c)} />
          ))}
        </div>
      )}

      <details className="more-detail" open={cards.length === 0}>
        <summary>Taste in numbers</summary>
        <div className="more-detail-body">
          <Section title="Your taste" note="Where each group's titles sit in your ranking, from #1 to your last title. The tick is the middle of your list.">
            {taste ? (
              <>
                <TasteBlock heading="Genres" data={taste.genres} total={ranked.length} />
                <TasteBlock heading="Themes (AniList tags)" data={taste.tags} total={ranked.length} />
                <TasteBlock heading="Studios" data={taste.studios} total={ranked.length} />
                <TasteBlock heading="Decades" data={taste.decades} total={ranked.length} />
              </>
            ) : (
              <p className="hint">
                Group stats unlock at {MIN_RANKED_FOR_TASTE} ranked titles and {MIN_DUELS_FOR_TASTE} duels, as Your type does. Before that they mostly show noise.
              </p>
            )}
          </Section>

          <Section title="You and the crowd" note="Compared with AniList's average scores, among the titles you have ranked.">
            {crowd ? (
              <>
                <p className="big-line">
                  {Math.round(crowd.agreement * 100)}% agreement
                  <span className="hint"> across {n(crowd.n)} titles. 100% would be AniList's exact order.</span>
                </p>
                <TakeList heading="You rank these higher than AniList does" takes={crowd.lovedMore} onOpen={onOpen} title={app.title} look={app.look} />
                <TakeList heading="You rank these lower" takes={crowd.lovedLess} onOpen={onOpen} title={app.title} look={app.look} />
              </>
            ) : (
              <Locked text={`Needs ${MIN_RANKED_FOR_CROWD} ranked titles with an AniList score.`} have={`You have ${n(ranked.length)} ranked.`} />
            )}
            {main && (
              <p className="hint">
                Half of what you have seen is in the top {main.medianTopPercent}% of the catalogue by popularity. You have seen{' '}
                {main.top100Seen} of the {main.top100} most popular
                {main.top100Sorted < main.top100 ? `, and logged ${main.top100Sorted}` : ''}.
              </p>
            )}
          </Section>
        </div>
      </details>

      <details className="more-detail" open={cards.length === 0}>
        <summary>Your duels</summary>
        <div className="more-detail-body">
          <div className="stat-tiles">
            <Tile value={n(over.duels)} label="duels" />
            <Tile value={n(over.seen)} label="seen" sub={`${n(over.unseen)} not seen`} />
            <Tile value={`${Math.round(over.tieShare * 100)}%`} label="too close to call" />
            <Tile
              value={n(over.activeDays)}
              label={over.activeDays === 1 ? 'day played' : 'days played'}
              sub={over.currentStreak > 1 ? `${over.currentStreak} in a row now` : over.longestStreak > 1 ? `best run ${over.longestStreak}` : undefined}
            />
          </div>
          <p className="hint">
            {over.firstAt ? `Since ${shortDate(over.firstAt)}. ` : ''}
            {over.busiest && over.busiest.count > 1 ? `Busiest day: ${shortDate(over.busiest.day)}, ${n(over.busiest.count)} duels. ` : ''}
            {over.activeDays > 1 ? `About ${Math.round(over.perActiveDay)} duels on a day you play.` : ''}
          </p>

          <Section title="Your top 10 over time">
            {points.length >= 3 ? (
              <RankChart points={points} ids={top10} title={title} />
            ) : (
              <p className="hint">The chart needs duels on at least three different days. Come back after a few sessions.</p>
            )}
            {week && week.climbers.length > 0 && (
              <div className="stat-block">
                <h4>Climbed this week</h4>
                {moves(week.climbers, true)}
              </div>
            )}
            {week && week.fallers.length > 0 && (
              <div className="stat-block">
                <h4>Fell this week</h4>
                {moves(week.fallers, false)}
              </div>
            )}
            {week && <p className="hint">{n(week.duelsSince)} duels in the last 7 days.</p>}
          </Section>

          <Section title="How settled it is" note="A title is settled once more duels are unlikely to move it far.">
            <ul className="bands">
              {bands.map((b) => (
                <li key={b.label}>
                  <span>{b.label}</span>
                  <span className="meter" aria-hidden="true">
                    <span style={{ width: `${(b.settled / b.total) * 100}%` }} />
                  </span>
                  <span className="band-count">
                    {b.settled} of {b.total}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Duel records">
            {duels.upsets.length > 0 && (
              <div className="stat-block">
                <h4>Results your ranking overruled</h4>
                <ol className="rank-list">
                  {duels.upsets.map((u) =>
                    pair(
                      u.winner,
                      u.loser,
                      `Won · #${rankOf.get(u.winner)}`,
                      `Lost · #${rankOf.get(u.loser)}`,
                      `The winner now sits ${u.gap} ${u.gap === 1 ? 'place' : 'places'} lower than the loser.`,
                    ),
                  )}
                </ol>
              </div>
            )}
            {duels.rivalries.length > 0 && (
              <div className="stat-block">
                <h4>Rivalries</h4>
                <ol className="rank-list">
                  {duels.rivalries.map((r) =>
                    pair(
                      r.a,
                      r.b,
                      `${r.aWins} ${r.aWins === 1 ? 'win' : 'wins'} · #${rankOf.get(r.a)}`,
                      `${r.bWins} ${r.bWins === 1 ? 'win' : 'wins'} · #${rankOf.get(r.b)}`,
                      `${r.aWins}–${r.bWins}${r.ties ? `, ${r.ties} too close to call` : ''}.`,
                    ),
                  )}
                </ol>
              </div>
            )}
            {duels.undefeated.length > 0 && (
              <div className="stat-block">
                <h4>Undefeated</h4>
                <ol className="rank-list">
                  {duels.undefeated.map((r) => (
                    <li key={r.id}>{row(r.id, `${r.wins}–0 · #${rankOf.get(r.id)}`)}</li>
                  ))}
                </ol>
              </div>
            )}
            {duels.winless.length > 0 && (
              <div className="stat-block">
                <h4>Winless</h4>
                <ol className="rank-list">
                  {duels.winless.map((r) => (
                    <li key={r.id}>{row(r.id, `0–${r.losses} · #${rankOf.get(r.id)}`)}</li>
                  ))}
                </ol>
              </div>
            )}
            {recordCount === 0 && <p className="hint">Nothing stands out yet. Rivalries and streaks show up as titles meet more than once.</p>}
          </Section>
        </div>
      </details>
      {sharing && (
        <SharePreview
          title={`${sharing.kicker}: ${sharing.headline}`}
          filename={`shobu-${sharing.id}`}
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

let measureCtx: CanvasRenderingContext2D | null | undefined;
const measurer = () => (measureCtx === undefined ? (measureCtx = document.createElement('canvas').getContext('2d')) : measureCtx);

/**
 * A title under a cover: at most two lines, broken only at spaces. A word wider than the cover, or a title
 * that runs past two lines, ends in an ellipsis instead of being broken mid-word.
 */
function CaptionTitle({ text }: { text: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let alive = true;
    const fit = () => {
      const ctx = measurer();
      const width = el.clientWidth;
      if (!alive || !ctx || !width) return;
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const next = wrapLines((t) => ctx.measureText(t).width, text, width, 2);
      setLines((prev) => (prev && prev.join('\n') === next.join('\n') ? prev : next));
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    // The web font may arrive after the first measure.
    void document.fonts?.ready.then(fit);
    return () => {
      alive = false;
      watch.disconnect();
    };
  }, [text]);
  return (
    <span ref={box} className="find-cover-title">
      {(lines ?? [text]).map((l, k) => (
        <span key={k} className="cap-line">
          {l}
        </span>
      ))}
    </span>
  );
}

export function FindCard({ card, app, onOpen, onShare }: { card: CardSpec; app: AppState; onOpen: (id: string) => void; onShare: () => void }) {
  const itemOf = (id: string) => app.itemById.get(id);
  const hue = CARD_HUES[card.id];
  // One or two covers at the left, with the text beside them.
  const side = !!card.side && card.covers.length > 0 && card.covers.length <= 2;
  const many = card.covers.length > 1 && !side;
  const head = (
    <>
      <p className="find-kicker">{card.kicker}</p>
      <h3 className="find-headline">{card.headline}</h3>
      {card.subhead && <p className="find-subhead">{card.subhead}</p>}
      {card.tagline && <p className="find-tagline">{card.tagline}</p>}
      {card.lines.map((l, k) => (
        <p key={l} className={k === 0 ? 'find-line' : 'hint'}>
          {l}
        </p>
      ))}
    </>
  );
  const covers = card.covers.length > 0 && (
    <ul className={`find-covers count-${card.covers.length}`}>
      {card.covers.map((c) => {
        const item = itemOf(c.id);
        if (!item) return null;
        const title = app.title(item);
        return (
          <li key={c.id}>
            <button className="find-cover" onClick={() => onOpen(c.id)} aria-label={`${title}${c.caption ? `, ${c.caption}` : ''}`}>
              <Cover look={app.look(item)} title={title} size="lg" />
              {many && <CaptionTitle text={title} />}
              {c.caption && <span className="find-cover-caption">{c.caption}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
  return (
    <article
      className={`find-card find-${card.id}${hue !== undefined ? ' toned' : ''}${card.hero ? ' hero' : ''}`}
      style={hue !== undefined ? ({ '--card-h': hue } as CSSProperties) : undefined}
    >
      {side ? (
        <div className={`find-side count-${card.covers.length}`}>
          {covers}
          <div className="find-side-text">{head}</div>
        </div>
      ) : (
        <>
          {head}
          {card.coversLabel && card.covers.length > 0 && <p className="find-label">{card.coversLabel}</p>}
          {covers}
        </>
      )}
      {card.rowsLabel && card.rows && card.rows.length > 0 && <p className="find-label">{card.rowsLabel}</p>}
      {card.rows && card.rows.length > 0 && (
        <ol className="rank-list">
          {card.rows.map((r) => (
            <li key={r.id}>
              <TitleRow id={r.id} meta={r.line} app={app} onOpen={onOpen} />
            </li>
          ))}
        </ol>
      )}
      {card.facts && card.facts.length > 0 && (
        <dl className="find-facts">
          {card.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="action-row start">
        <button className="btn btn-small" onClick={onShare}>
          Share
        </button>
      </div>
    </article>
  );
}

/** A title as it looks in Ranking: small cover, name, and a line under it. Opens the title card. */
function TitleRow({ id, meta, app, onOpen }: { id: string; meta: ReactNode; app: AppState; onOpen: (id: string) => void }) {
  const item = app.itemById.get(id);
  if (!item) return null;
  const title = app.title(item);
  return (
    <button className="rank-row" onClick={() => onOpen(id)}>
      <Cover look={app.look(item)} title={title} size="sm" />
      <span className="rank-body">
        <span className="rank-title">{title}</span>
        <span className="rank-meta">{meta}</span>
      </span>
    </button>
  );
}

/** What the locked type card needs, as two small bars. */
function Unlock({ ranked, duels }: { ranked: number; duels: number }) {
  return (
    <section className="unlock" aria-label="Your type is locked">
      <p className="unlock-title">
        Your type unlocks at {MIN_RANKED_FOR_TASTE} ranked and {MIN_DUELS_FOR_TASTE} duels
      </p>
      <Progress label="Ranked" have={ranked} need={MIN_RANKED_FOR_TASTE} />
      <Progress label="Duels" have={duels} need={MIN_DUELS_FOR_TASTE} />
    </section>
  );
}

function Progress({ label, have, need }: { label: string; have: number; need: number }) {
  const shown = Math.min(have, need);
  return (
    <div className="progress">
      <span className="progress-label">{label}</span>
      <span className="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={need} aria-valuenow={shown}>
        <span style={{ width: `${(shown / need) * 100}%` }} />
      </span>
      <span className="progress-count">
        {shown}/{need}
      </span>
    </div>
  );
}

function Tile({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="stat-section">
      <h3>{title}</h3>
      {note && <p className="hint">{note}</p>}
      {children}
    </section>
  );
}

function Locked({ text, have }: { text: string; have: string }) {
  return (
    <p className="hint locked">
      {text} {have}
    </p>
  );
}

/** Each group as a dot on a line from #1 to your last title: where its titles sit on average. */
function TasteBlock({ heading, data, total }: { heading: string; data: { best: TasteGroup[]; worst: TasteGroup[] }; total: number }) {
  if (data.best.length === 0 && data.worst.length === 0) return null;
  const row = (g: TasteGroup, good: boolean) => (
    <li key={g.name} className={good ? 'good' : 'bad'}>
      <span className="dot-name">{g.name}</span>
      <span className="dot-note">
        {g.n} {g.n === 1 ? 'title' : 'titles'}, avg #{Math.round(g.avgRank)}
      </span>
      <span className="dot-line" role="img" aria-label={`Average position ${Math.round(g.avgRank)} of ${total}`}>
        <span className="dot" style={{ left: `${total > 1 ? ((g.avgRank - 1) / (total - 1)) * 100 : 50}%` }} />
      </span>
    </li>
  );
  return (
    <div className="stat-block">
      <h4>{heading}</h4>
      <div className="dot-scale" aria-hidden="true">
        <span>#1</span>
        <span>#{total}</span>
      </div>
      {data.best.length > 0 && (
        <>
          <p className="hint legend">Ranked above your middle</p>
          <ul className="dot-list">{data.best.map((g) => row(g, true))}</ul>
        </>
      )}
      {data.worst.length > 0 && (
        <>
          <p className="hint legend">Ranked below it</p>
          <ul className="dot-list">{data.worst.map((g) => row(g, false))}</ul>
        </>
      )}
    </div>
  );
}

function TakeList({ heading, takes, onOpen, title, look }: { heading: string; takes: HotTake[]; onOpen: (id: string) => void; title: (i: Item) => string; look: (i: Item) => Look }) {
  if (takes.length === 0) return null;
  return (
    <div className="stat-block">
      <h4>{heading}</h4>
      <ol className="rank-list">
        {takes.map((t) => (
          <li key={t.item.id}>
            <button className="rank-row" onClick={() => onOpen(t.item.id)}>
              <Cover look={look(t.item)} title={title(t.item)} size="sm" />
              <span className="rank-body">
                <span className="rank-title">{title(t.item)}</span>
                <span className="rank-meta">
                  Yours #{t.yourRank} · AniList {t.item.averageScore}/100, #{t.crowdRank} of the same titles
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Rank of each top-10 title at each checkpoint. Rank 1 is at the top. */
function RankChart({ points, ids, title }: { points: HistoryPoint[]; ids: string[]; title: (id: string) => string }) {
  // Ten lines are hard to tell apart; tapping a name in the legend picks out its line.
  const [picked, setPicked] = useState<string | null>(null);
  const W = 640;
  const H = 260;
  const pad = { l: 34, r: 14, t: 12, b: 26 };
  const maxRank = Math.max(10, ...points.flatMap((p) => [...p.ranks.values()]));
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  // Log scale: the top of the list is where most of the movement matters.
  const y = (r: number) => pad.t + (Math.log(r) / Math.log(maxRank)) * (H - pad.t - pad.b);
  const hue = (k: number) => Math.round((k * 360) / ids.length + 250) % 360;
  const ticks = [1, ...[3, 10, 30, 100].filter((t) => t < maxRank * 0.8), maxRank];

  return (
    <figure className="rank-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rank of your current top 10 over time">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis">
              {t}
            </text>
          </g>
        ))}
        {[...ids.entries()].sort(([, a], [, b]) => Number(a === picked) - Number(b === picked)).map(([k, id]) => {
          const pts = points.map((p, i) => [i, p.ranks.get(id)] as const).filter((q): q is readonly [number, number] => q[1] !== undefined);
          if (pts.length === 0) return null;
          const color = `hsl(${hue(k)} 65% 55%)`;
          const faded = picked !== null && picked !== id;
          return (
            <g key={id} stroke={color} fill={color} opacity={faded ? 0.12 : 1} className={picked === id ? 'picked' : undefined}>
              <polyline fill="none" strokeWidth={picked === id ? 4 : 2} strokeLinejoin="round" points={pts.map(([i, r]) => `${x(i)},${y(r)}`).join(' ')} />
              {pts.map(([i, r]) => (
                <circle key={i} cx={x(i)} cy={y(r)} r={3} stroke="none" />
              ))}
            </g>
          );
        })}
        <text x={pad.l} y={H - 6} className="axis">
          {shortDate(points[0].at)}
        </text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="axis">
          {shortDate(points[points.length - 1].at)}
        </text>
      </svg>
      <figcaption>
        <p className="hint legend">Tap a title to pick out its line.</p>
        <ol className="legend-list">
          {ids.map((id, k) => (
            <li key={id}>
              <button className={picked === id ? 'on' : ''} aria-pressed={picked === id} onClick={() => setPicked(picked === id ? null : id)}>
                <span className="swatch" style={{ background: `hsl(${hue(k)} 65% 55%)` }} aria-hidden="true" />
                <span>
                  {k + 1}. {title(id)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
