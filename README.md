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
