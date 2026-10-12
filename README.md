# Shōbu

Rank anime by picking between two at a time (勝負, shōbu: a match or contest). The app ships with a catalogue of AniList's 5,000 most popular anime and 3,000 most popular manga, grouped into one entry per franchise (a manga joins the anime made from it; manga with no anime get their own entry), and keeps a ranking that updates after every duel.

- **Anime / Manga / Both** (top bar): which titles the whole app shows. There is one ranking underneath; each view shows its part. For titles that exist as both, Sort asks Watched, Read, Both or Neither (`src/rank/medium.ts`).
- **Sort**: go one at a time (seen it, haven't seen, ask later), or tap every title you've seen in a cover grid. Search finds anything in the catalogue, or on AniList for titles outside it.
- **Duel**: pick the one you prefer. The ranking is a Bradley-Terry fit over every vote you've made.
- **Ranking**: your list, plus the titles you've marked haven't seen. Open a title to split parts of it into their own title, or join another title into it, when the catalogue's franchise grouping is wrong. Those changes are stored separately (`src/anilist/overrides.ts`) and reapplied on every catalogue update.
- **For you**: unseen titles suggested from AniList users' recommendations for the shows you rank highest, plus the genres you rank well.
- **Stats**: totals, your top 10 over time (replayed from the vote log), how settled the list is, taste by genre, studio and decade, how you compare with AniList's scores, rivalries and upsets. Group stats wait for 30 ranked titles and 100 duels.

The catalogue (`public/catalogue.json`) is built by `scripts/build-catalogue.ts` on GitHub Actions monthly (`.github/workflows/catalogue.yml`), so devices never download it from AniList. Everything you do is saved in your browser (IndexedDB). Settings has "Save a copy" (the share sheet on phones) and "Load a copy" for backups and moving devices. A banner reminds you to save after 150 new marks and duels or two weeks. Undo on Duel and Sort only undoes what was done on that screen; split and join changes are undone from Settings.

## Development

```
npm install
npm run dev     # local server
npm test        # solver, pair selection and grouping tests
npm run build
```

Every push to `main` is tested, built and published to GitHub Pages by `.github/workflows/pages.yml`.

Storage goes through the `Store` interface in `src/store/store.ts`, so a server-backed store (for friends) can replace the local one later without touching the rest of the app.

Anime data and cover art from [AniList](https://anilist.co).

## How it works page and hiding suggestions

Settings and the welcome screen link to a short in-app guide (`src/app/HowItWorks.tsx`). In For you, **Not interested** hides a suggestion. Hidden titles are stored by AniList entry id in the `dismissed` meta key, are included in saved copies, and can be restored from the list at the bottom of the page.

## How a title is shown

`src/rank/look.ts` picks the side of a title to show (`sideFor`) and builds its cover, years and description from that side's entries (`lookOf`). Anime and manga views show their side; the both view shows the side you know, or the anime with the manga noted when you know both or haven't said. Stats read years, studio and AniList score from the shown side (`withLook`).

## Newcomer duels and the Library

Duel now brings in unsorted titles you've probably seen (`newcomer` pairs in `src/rank/pairs.ts`), using the same "probably seen" model as the quick sort (chance at least 0.4). A newcomer meets a title from the middle of your list; picking either side marks it seen and its next duels place it. "Haven't seen" (or N) marks it not seen. How often newcomers come follows the last 12 outcomes (`newcomerShare`, stored as `newcomerLog` in meta): from about one duel in seven up to about one in two. In the both view, a newcomer that is both anime and manga is marked seen and the duel screen asks whether you watched or read it; "Later" leaves it as "watched or read?". Undo removes the vote and the mark together.

Refinement leaves a pair alone once it has met twice, until 120 days after its last duel. In a simulated 80-title list this cut late duels between top-10 titles from about 30% to almost none.

The Sort tab is now the Library: quick sort (one at a time, likeliest first) for starting a list, Browse (cover grid narrowed by status, decade and year), Search AniList, and a queue for titles still waiting on "watched or read?". The quick sort's long-shot notice also shows when the next title's chance of having been seen is under 15%.

### Cold start and fixes (12 Oct)

A new list starts in Duel: with fewer than two titles ranked, the likeliest unsorted titles duel each other (`fresh` holds the side or sides not yet on your list). While the list has fewer than 15 titles, at least 60% of duels bring someone in. The newcomer roll now comes before placement; before, a backlog of titles marked seen in the Library (three placement duels each) kept newcomers out entirely. In the both view, two-form newcomers wait in a queue and Duel asks "watched or read?" about four at a time.

First launch now stores the catalogue before showing the app, and skips the launch-time catalogue check right after the welcome screen loaded it. Both had been delaying the first answers by a couple of seconds.

## Tips

Duel shows one short tip at a time, below the buttons, the first time something relevant comes up: a franchise with ten or more entries near the top (Split up), five passes on new titles in a row (Browse by year), the first title known in one form only (the view switch), a jump of eight places or more, heavy use of ties, 20 titles ranked (For you) and Stats unlocking. Tips wait for eight duels, are at least ten duels apart, and each appears once. State is in the `tips` meta key and the export. Settings can turn tips off or show them again. Rules are in `src/rank/tips.ts`.

## Share your top 10

Ranking has a Share top 10 button (shown from three ranked titles). It draws a 1080×1350 picture of your top ten in the current view with canvas (`src/app/shareImage.ts`): rank, cover, title, years and studio. On phones it opens the share sheet; elsewhere it downloads a PNG. Covers load with CORS; any that fail to load are drawn as a block in the cover's colour.

## The title card

Every per-title edit lives on one card (`src/app/ItemSheet.tsx`): duel record, seen / anime / manga, what the title groups (entries with years and formats, folded after six), Split up and Join, and Not interested for For you (unseen titles only). It opens from the title name in Duel and Quick sort (`TitleLink`, with a small i), the i button on each cover in Browse, and rows in Ranking, For you and Stats.
