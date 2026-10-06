# End-user simulation

A genuine end-user run, every time: a **new character built through the real form** (live) or a new in-memory Sheet (CI), a
**new vault file**, a **cold app start**, then a player does what players do -- tap, type, read the screen -- while a simulated DM
edits and publishes in the Sheet. Nothing carries over between scenarios or runs.

```
node sim/run.js                      # jsdom device + fake Sheet: offline, what CI runs
node sim/run.js --only play-a-fight  # one scenario
node sim/run.js --device ios         # the real iPhone (live Sheet), see below
```

Reports: `sim/reports/<run id>/report.md|json` (+ a screenshot per failed step on the phone).

## Pieces

- `scenarios.js` -- named stories, written only against **Device** (`open reopen tap type value text notices goToPage runCommand setOffline screenshot`) and **World** (`sheetRow`, `dm.draft/award/publish`, `cleanup`). Never touch plugin internals here.
- `devices/dom.js` -- the plugin's real view in jsdom. `devices/ios.js` -- Appium/XCUITest on the Mac (accessibility labels; the plugin sets aria-labels on HP, AC, Gold, item names, slots, page arrows).
- `worlds/live.js` -- real form (`live/form.js`, Playwright) + real Sheet; the DM acts through the guarded **test hook** (`TestHook.js` in the Apps Script): disabled unless the script property `TEST_HOOK_SECRET` exists, and it can only touch players named `ZZSTRESS_*`. Cleanup deletes every `ZZSTRESS_` row and file.
- `BUGS.md` -- the regression register.

## Regression policy (so fixed bugs stay fixed)

1. Reproduce the bug as a scenario (or extend one). It must FAIL first.
2. Fix the plugin/server. The scenario passes.
3. Add the line to `BUGS.md`. CI runs every scenario on every push; the phone run is the pre-release gate.

## First run on the phone

One-time: Mac side per `iphone-bridge/mac-handoff` (Appium on 127.0.0.1:4723, WebDriverAgent signed), SSH tunnel `ssh -N -L 4723:127.0.0.1:4723 mac-delegate`, phone on USB and unlocked, trust the developer profile (Settings > General > VPN & Device Management).
Install the candidate on the phone via BRAT (docs/release.md step 2). Then copy `ios.config.example.json` to `ios.config.json` and fill it in; put `TEST_HOOK_SECRET=...` in `sim/.env.local` (the same value set as a Script Property); `npm i --no-save playwright`.
**`devices/ios.js` is untested on a device**: expect small fixes in locating elements, toast reading (`notices()`), keyboard dismissal, and how the new character's note reaches the phone's vault (`SIM_DRIVE_DIR` mirror -> vault sync). Fix those with the phone in hand, then the same scenarios run unchanged.

### Findings from the first phone session (2026-10-06)
- Mac side: WebDriverAgent needs the phone UNLOCKED with Auto-Lock off (Low Power Mode greys Auto-Lock out) and the developer certificate trusted (Settings > General > VPN & Device Management).
- Fresh Obsidian install driven through the UI: create vault, Community plugins > Exit Restricted mode, install and enable BRAT, command palette "BRAT: Add a beta plugin", repo + version `x.y.z-rc.N` (pre-releases ARE listed), Add plugin. My Little Guy opens its panel by itself. The pre-release test channel works.
- Deliver a character note with `obsidian://new?vault=...&name=...&content=...` via Appium `mobile: deepLink` (works for the full ~5KB sheet).
- Web-view text is readable from the page source (`ios_remote.py labels`); command-palette results are NOT labelled elements, so tap them by position. The quick-actions menu (bottom toolbar) only exists on a "New tab" view, not inside a note: opening the panel from a note needs another route (ribbon icon in the sidebar, or a toolbar pin per the README).
