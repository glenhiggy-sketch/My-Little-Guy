# Releasing

1. Bump `version` in `manifest.json` and `package.json`, add `versions.json` and a `## x.y.z` CHANGELOG entry.
2. Commit, then `npm run release`. It checks the files agree, runs the tests, tags `x.y.z` (no leading `v`), pushes, and creates the GitHub release with `main.js`, `manifest.json`, `styles.css` attached.
3. BRAT users receive it on their next update check. `node scripts/release.mjs --check` (run by CI) only checks consistency.

Pre-release gate used for sheet sync: run `npm run sim:ios` on the test iPhone before wider rollout.
