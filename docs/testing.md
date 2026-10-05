# Testing

| Layer | Command | What it proves |
|---|---|---|
| Server logic | `npm run test:server` | The Apps Script endpoints and Publish step, on in-memory fakes of Sheets/Drive |
| Plugin <-> server | `npm run test:sync` | The plugin's real view code (jsdom) talking to the real server logic: ownership, dirty tracking, awards, offline, restore |
| End-user simulation | `npm run sim` | A fresh player, a fresh character, a fresh Sheet, every scenario, driven only by tapping/typing/reading the screen |
| Same, on the phone | `npm run sim:ios` | The identical scenarios on the real iPhone via Appium (see sim/README.md) |

Everything above except `sim:ios` runs offline and in CI. `test/live_transport.js <sheet.md>` is a one-off check of the real HTTPS transport against the deployed script (leaves a ZZSTRESS row; the test hook's `cleanup` removes it).

**Bugs stay fixed**: every bug becomes a named scenario in `sim/scenarios.js` and a line in `sim/BUGS.md` (see sim/README.md).
