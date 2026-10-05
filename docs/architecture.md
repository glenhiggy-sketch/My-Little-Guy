# Architecture

```
Character Intake form --> Google Sheet (source of truth) <--> My Little Guy (this plugin)
                                |  \
                  DMs read/edit |   `--> Discord bot (read only: links players, leaderboard, gold announcements)
                  the Sheet     |
                  (draft -> Publish)
```

- **The Sheet** (an Apps Script web app bound to "Kadria Character Intake") holds table-side data: HP, AC, gold, inventory, spell slots, party, conditions, DM notes, gold awards. Tabs: `Characters`, `Published`, `Gold Awards`, `Submissions`.
- **Ownership is split by field.** Players own HP, AC, gold, inventory, spell slots (they `push` them). The DM owns party, conditions, DM notes and awards: edits are drafts until the DM runs *Kadria > Publish DM changes*. Level, class and species only change by resubmitting the form.
- **Each generated sheet carries a link**: `<!-- kadria-sync {"v":1,"endpoint":...,"id":...,"token":...} -->`, a per-character token. The plugin only talks to that endpoint with that token (`pull`, `push`).
- **Policy**: while a character has unsent changes the device wins; when clean the sheet wins. Gold awards are never added automatically (every gold message says players update their own inventory in My Little Guy).
- **Server code** lives in the Character Intake Apps Script project (`Sync.js`, `Publish.js`, `TestHook.js`). A copy is vendored into `test/vendor/appscript/` so tests here are self-contained; refresh with `npm run vendor`.
- `main.js` is a single unbundled file. Sync logic is the `SYNC_CORE` block near the top (exported as `module.exports.__sync` for tests) plus the `renderSyncBar` / `sync*` methods on the view.
