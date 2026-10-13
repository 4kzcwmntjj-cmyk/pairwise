# Shōbu

Rank the anime you've watched and the manga you've read by picking between two at a time (勝負, shōbu: a match or contest). Live at https://doomedcommercialarea.github.io/shobu/.

- **Duel**: pick the one you prefer. The ranking is a Bradley-Terry fit over every vote, and the app picks pairs that help settle it. Titles you've probably seen join your list through duels.
- **Ranking**: your list, with Share my page (your ranking and Taste cards travel in a link; no server) and friends' pages.
- **Library**: Quick log (say whether you know each title, likeliest first) and Browse (every title by status, decade and year, with search).
- **Taste**: findings as cards, each shareable as a link to your page or as a picture (your type, hot takes, themes, era, studio, your #1 and more), with the detail in two folds below.
- **Picks**: suggestions from AniList users' recommendations for the titles you rank highest, plus the genres and themes you rank well.
- **Settings** (the gear): save and load a copy of your data, titles in English or romaji, tips, your grouping changes.

The Anime / Manga / Both switch in the top bar filters everything; there is one ranking underneath. Every per-title edit (seen, anime or manga, split up, join, rank anime and manga apart) is on the title card, which opens wherever a title appears.

## Data

The catalogue (`public/catalogue.json`: AniList's 5,000 most popular anime and 3,000 most popular manga, grouped into one title per franchise) is built from AniList by `scripts/build-catalogue.ts` on GitHub Actions, monthly and when the catalogue code changes. Your marks and duels stay in your browser (IndexedDB); Settings saves a copy to a file and loads one back. The app works offline once loaded.

Anime data and cover art from [AniList](https://anilist.co).

## Development

```
npm install
npx vite --port 5199 --host 127.0.0.1   # dev server
npm test                                 # unit tests (vitest)
npx tsc --noEmit                         # type check
npm run build
```

Every push to `main` is tested, built and published to GitHub Pages. Scripts for a demo list, simulations, timing and screen checks are in `scripts/`; each says how to run it at the top.
