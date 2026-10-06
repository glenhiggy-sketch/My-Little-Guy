# Bug -> scenario register

Every bug found on any device gets (1) a scenario in `scenarios.js` that fails while the bug exists and (2) a line here.
`node sim/run.js` refuses to run if a line names a scenario that doesn't exist, so the register can't rot.
Format: `- YYYY-MM-DD <what went wrong> -- scenario: \`name\``

- 2026-10-05 Opening the panel re-parsed the printed sheet and silently reset HP/inventory/spell slots (also unsent changes were lost) -- scenario: `reopen-keeps-unsent-changes`
- 2026-10-05 Same re-parse reset values that had already been sent -- scenario: `reopen-after-send`
- 2026-10-05 A DM gold award must never change the player's gold by itself -- scenario: `gold-award-is-never-automatic`
- 2026-10-06 Panel already open when the character note is opened showed a blank character (found on the iPhone) -- scenario: `note-opened-while-panel-open`
