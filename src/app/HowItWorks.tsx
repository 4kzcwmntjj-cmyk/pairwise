/** A short guide to what each part of the app does. Linked from the welcome screen and Settings. */
export function HowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <main className="screen settings howto">
      <div className="action-row start">
        <button className="btn btn-quiet btn-small" onClick={onClose}>
          Back
        </button>
      </div>
      <h2>How Shōbu works</h2>
      <p>
        Shōbu builds a ranking of the anime you've watched and the manga you've read. You never score anything. You pick
        between two titles at a time, and the order follows from your picks.
      </p>

      <section>
        <h3>1. Duel</h3>
        <p>
          Duel shows two titles and asks which you prefer. A tie is allowed. Left and right arrows pick, the down arrow
          ties, S skips the pair and Z undoes. Early duels place a new title roughly; later ones settle neighbours that are
          still close. Each duel moves the ranking straight away.
        </p>
        <p>
          Your list starts in Duel. Titles marked New aren't on your list yet; they're ones you probably know. If you know
          it, pick as usual and it joins your list. If not, press Haven't seen under it (or N) and another takes its place.
          New titles come often while your list is short, and less often later, depending on how many you turn out to
          know. Two titles that have met twice aren't asked again for a few months, so the top of your list doesn't keep
          replaying the same close calls.
        </p>
        <p>
          In the both view, a new title that is both an anime and a manga could be either. Every few picks, Duel asks
          about those together: anime, manga or both. Later leaves them for the Library.
        </p>
      </section>

      <section>
        <h3>2. Library</h3>
        <p>
          The Library holds every title. Quick sort shows one at a time, likeliest first, and asks if you know it; it's a
          fast way to add a batch at once. Browse shows covers you can narrow by decade and year, which helps you remember what
          you've seen once the obvious ones are done. Search AniList finds anything older or less popular.
        </p>
        <p>
          Some titles exist as both anime and manga, such as Death Note. For those, the Library asks which you've seen:
          the anime, the manga, both or neither. A card is one franchise, so the answer is about the whole thing, not one season.
        </p>
      </section>

      <section>
        <h3>3. Ranking and Stats</h3>
        <p>
          Ranking is the full list, with each title's duel count. A title is marked settled once more duels are unlikely
          to move it far; until then its position is a best guess. Tap a title to see its details, change whether you've
          seen it, or fix how it's grouped.
        </p>
        <p>
          Stats shows how your top 10 has moved over time, how settled your list is, where your taste leans, and where you
          disagree with AniList's average scores. Most of it needs a few dozen duels before it says anything.
        </p>
      </section>

      <section>
        <h3>4. Anime, manga or both</h3>
        <p>
          The switch at the top sets what the whole app shows. There is one ranking underneath. The anime view shows what
          you've watched, the manga view what you've read, and both shows everything. A title you've only read counts as
          not seen in the anime view. Duels only use titles in the current view.
        </p>
        <p>
          A title's card shows the side you know. In the manga view, Death Note shows the manga's cover and years. In the
          both view, a title you've only read shows as the manga, one you've only watched as the anime, and one you know
          both ways as the anime with the manga noted.
        </p>
      </section>

      <section>
        <h3>5. Fixing groups</h3>
        <p>
          Titles are grouped into franchises automatically, and the grouping is sometimes wrong. A franchise can swallow
          spin-offs you think of as separate, or two titles that should be one can sit apart. Open a title and choose
          Split up or Join with another title.
        </p>
        <p>
          Split lets you tick the parts to take out. Past duels stay with the original; the new titles start with none.
          Join folds another title into this one and counts duels from both. Every change is listed in Settings, where you
          can undo it. Your changes survive catalogue updates.
        </p>
      </section>

      <section>
        <h3>6. For you</h3>
        <p>
          Suggestions come from AniList users' recommendations for the titles you rank highest, plus genres you rank well.
          Press Not interested on any you don't want and it won't come back. Hidden ones can be restored at the bottom of
          the page.
        </p>
      </section>

      <section>
        <h3>7. Tips</h3>
        <p>
          Duel shows a short tip the first time something it explains comes up, such as a franchise that may need splitting
          or the Library's Browse tab. Each tip shows once and they are spaced apart. Settings can turn them off or show them
          again.
        </p>
      </section>

      <section>
        <h3>8. Your data</h3>
        <p>
          Everything is stored in this browser on this device. There is no account. Use Save a copy in Settings now and
          then; on an iPhone it opens the share sheet, where you can pick Save to Files. Load a copy brings it back, or
          moves your list to another device. The app reminds you when you have unsaved work.
        </p>
      </section>

      <div className="action-row start">
        <button className="btn btn-primary" onClick={onClose}>
          Back
        </button>
      </div>
    </main>
  );
}
