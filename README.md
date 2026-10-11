# Shōbu

Rank anime by picking between two at a time (勝負, shōbu: a match or contest). The app ships with a catalogue of AniList's 5,000 most popular anime, grouped into one entry per series, and keeps a ranking that updates after every duel.

- **Sort**: go one at a time (seen it, haven't seen, ask later), or tap every title you've seen in a cover grid.
- **Duel**: pick the one you prefer. The ranking is a Bradley-Terry fit over every vote you've made.
- **Ranking**: your list, plus the titles you've marked haven't seen.
- **For you**: unseen titles suggested from AniList users' recommendations for the shows you rank highest, plus the genres you rank well.
- **Add**: find titles outside the catalogue on AniList.

The catalogue (`public/catalogue.json`) is built by `scripts/build-catalogue.ts` on GitHub Actions monthly (`.github/workflows/catalogue.yml`), so devices never download it from AniList. Everything you do is saved in your browser (IndexedDB). Settings has "Save a copy" and "Load a copy" for backups and moving devices.

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
