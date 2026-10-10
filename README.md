# Football

An installable, spoiler-free NFL PWA for GitHub Pages. No build step, Firebase, Cloudinary, API key, or server required.

## Publish

1. Create or use a GitHub repository (for example, `Football`).
2. Copy the contents of this folder into the repository root. `index.html` must be at the root, alongside `app.js`, `sw.js`, and the `logos` folder. Include `.nojekyll` (a hidden file).
3. Commit and push to `main` using GitHub Desktop or Git.
4. In the repository, go to Settings → Pages. Choose Deploy from a branch, `main`, and `/(root)`, then Save.
5. Open the HTTPS URL shown by GitHub Pages once publication finishes.
6. In Football, open Settings → Install app. You can also use your browser's install option. On iPhone, open the site in Safari and use Share → Add to Home Screen.

The app uses relative paths and supports project URLs such as `https://YOUR-USERNAME.github.io/Football/` and custom domains.

## Data

Game information comes directly from ESPN's unofficial, publicly accessible JSON feeds. The app calculates watch recommendations in the browser. Feed access and availability can change.

All 32 logos and both font weights are included locally. The service worker caches the app shell. Live game updates need an internet connection; saved matchups and ratings can be viewed offline.

Watched games, settings, and cached ratings stay in this browser on this device. There is no account or cross-device sync. Use Settings → Export backup / Import backup to move watched games and settings.

If moving from the ChatGPT-hosted version, export your backup there first and import it on the GitHub Pages version. Different website addresses have separate local storage.

## Updates

Replace the app files and push your changes. When changing the offline shell, increment the `football-shell-v3` cache name in `sw.js` so cached assets refresh. Preserve the relative file paths.

## Reference

GitHub Pages setup: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## v1.2

Best Games includes only regular-season and playoff games, including when an older cache contains preseason games.

Tap any game and choose Reveal Stats to view its score, quarter scoring, scoring summary, team comparison, and basic player box scores. Marking a game watched reveals these automatically. Hide Stats conceals the game again during that session. Removing its watched mark conceals its stats. Manual reveal choices apply to the current session; watched marks persist.

Stats use ESPN's box-score feed rather than Google. Standard categories cover passing, rushing, receiving, defense, interceptions, fumbles, kicking, punting, and returns; advanced QBR is omitted. Unavailable data is shown clearly. Revealed live stats refresh every 30 seconds while the details are open and Auto-refresh is enabled.

## Season Stats

Stats is the fourth tab, with Settings fifth. Choose any NFL team (49ers by default), season, and regular-season week cutoff. The app loads completed games from that team's ESPN schedule and aggregates player box scores. Passing and rushing trends, receiving leaders, touchdown leaders, and all standard player-stat tables use actual loaded box scores. Rates are calculated from cumulative attempts/receptions, and longest plays use the maximum. Missing games are reported as partial totals. Refresh retries and updates the data; recent team-season data is cached on this device. Preseason and playoffs are excluded from season totals.

The game modal locks background scrolling. Its player subtabs group Offense, Defense, and Special Teams. Personal game ratings have been removed; older backups remain importable.

Validation: `npm ci` then `npm test` (development checks only; deployment needs no build).
