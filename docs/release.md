# Releasing

**Rule: nothing is published as a real GitHub release until that exact build has passed every scenario on the test iPhone.**

1. Bump `version` in `manifest.json` and `package.json`, add a `versions.json` entry and a `## x.y.z` CHANGELOG entry. Commit.
2. `npm run candidate` -- tests, then publishes the build as a GitHub **pre-release** `x.y.z-rc.N` (not "latest", so normal BRAT users are not offered it). On the phone: BRAT > Add beta plugin > `glenhiggy-sketch/My-Little-Guy` > that tag.
3. `npm run sim:ios` -- the full end-user simulation on the phone. If every scenario passes it writes `sim/last-device-pass.json` containing the hash of main.js + manifest.json + styles.css. Fix bugs by adding a scenario first (sim/README.md), then repeat from 2.
4. Commit `sim/last-device-pass.json`, then `npm run release`. It refuses unless that file's hash matches the current build, then tags, pushes and creates the real release.

Any change to main.js / manifest.json / styles.css changes the hash, so a pass never carries over to a different build. `node scripts/release.mjs --check` (CI) only checks that versions and changelog agree.
