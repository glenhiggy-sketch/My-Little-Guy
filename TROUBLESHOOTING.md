# My Little Guy: troubleshooting

Work down the list. Most problems are one of the first four.

## 1. My Little Guy is not in the plugin list, or it will not turn on

1. Open **Settings**, then **Community plugins**. If you see **Turn on community plugins**, tap it and confirm. Obsidian starts in
   *Restricted mode*, which blocks every plugin.
2. Install **BRAT** from **Browse** and turn it on.
3. Open **Settings**, then **BRAT**, then **Add beta plugin**, and paste `glenhiggy-sketch/My-Little-Guy`. Choose **Add plugin**.
4. Go back to **Community plugins**, find **My Little Guy** and turn its toggle **on**. Installing it is not enough; it must be enabled.
5. Close and reopen Obsidian if it still does not appear.

## 2. I cannot find how to open it

- Tap the **sword icon**. On a phone it is behind the menu (the three lines or dots).
- Or open the **command palette** and run **Open My Little Guy**.
- On a phone you can pin it: long-press the bottom toolbar, choose **Configure toolbar**, add **Open My Little Guy**.

## 3. The panel opens but my character is empty

- Open your character note first (the file named like `Name - Player.md`), then open My Little Guy.
- The note must be a Kadria character sheet. If you edited the headings by hand, save a fresh copy: scan the QR code on your sheet and use
  **Open in Obsidian** again.
- Make sure you are in the vault that holds the note.

## 4. My spells are missing or show a broken card

Your sheet shows each spell as a card that Obsidian reads from separate spell files. They live in a folder called **Books**.

1. Unzip **Kadria Spell Cards.zip** (it came with the email).
2. Move the **Books** folder to the top level of your vault, next to your character note. If asked, merge it with any existing folder.
3. Reopen your character note. The cards should appear.

If a single spell is missing, check that its file exists at `Books/Spells/<School>/<Spell name>.md`. Spells with a slash in the name are
saved with a hyphen, for example `Enlarge-Reduce.md`.

## 5. Get from sheet or Send to sheet fails

- Check you are online.
- "not found or bad token" means the link in your note is out of date. Open the QR code on your sheet again and recreate the note.
- Changes you made while offline are kept; send them again when you are back online.
- Ask your DM to check the Character Sheet if it keeps failing.

## 6. The QR code opens the Google Drive app

The old form link was claimed by the Drive app. Use the QR code printed on your sheet or the new entry QR; both open a page in the browser.
If you only have the old link, press and hold it and choose **Open in Safari**.

## 7. Open in Obsidian does nothing

- Obsidian must be installed on that device.
- Tap **Copy the note** on the page, then in Obsidian create a new note and paste it. Or use **Download the note** and save it into your vault.

## 8. Obsidian asked about Sync

You do not need Sync. Skip it. Your characters are saved in your vault; nothing else is required.

## 9. Updating My Little Guy

BRAT updates it for you. To force a check: **Settings**, **BRAT**, **Check for updates to all beta plugins**.

## Still stuck?

Run **My Little Guy: Send test report** from the command palette, then send the file to your DM along with a sentence about what you
were doing. The report lists steps and errors only, not your character's details.
