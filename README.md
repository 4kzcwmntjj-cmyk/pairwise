# Pairwise

Rank anime by picking between two at a time. The app loads the 1,500 most popular titles from AniList, groups seasons and films into one entry per series, and keeps a ranking that updates after every duel.

- **Sort**: go through titles and mark each one: a starting tier (S to D) if you've seen it, "haven't seen", or "want to watch".
- **Duel**: pick the one you prefer. The ranking is a Bradley-Terry fit over every vote you've made.
- **Ranking**: your list, plus want-to-watch and not-seen lists.
- **Add**: find titles outside the catalogue on AniList.

Everything is saved in your browser (IndexedDB). Settings has "Save a copy" and "Load a copy" for backups and moving devices.

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
