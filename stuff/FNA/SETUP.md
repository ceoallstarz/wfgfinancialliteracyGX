# Wiring the FNA to Google Drive

Fifteen minutes, once. After that the whole team just uses the link.

## 1. Make the sheet

1. Go to drive.google.com and create a new Google Sheet. Name it **Hyperion FNA Data**.
2. Look at the URL. It reads like
   `https://docs.google.com/spreadsheets/d/`**`1aB2cD3eF4gH5iJ6kL7mN8oP`**`/edit`
   The bold part is the **Sheet ID**. Copy it.
3. Optional but recommended: create a Drive folder called **FNA Backups** and copy its ID from the end of its URL.

## 2. Add the script

1. In your new sheet, go to **Extensions → Apps Script**.
2. Delete whatever code is in the editor.
3. Paste the entire contents of `Code.gs`.
4. At the top, replace `PASTE_YOUR_SHEET_ID_HERE` with your Sheet ID. If you made a backup folder, paste its ID into `BACKUP_FOLDER_ID` too.
5. Click the save icon.

## 3. Deploy it

1. Click **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set **Execute as: Me**.
4. Set **Who has access: Anyone**.
5. Click **Deploy**, then **Authorize access** and approve the permissions. Google will warn you the app isn't verified — click **Advanced**, then **Go to (your project name)**. That warning is normal for your own scripts.
6. Copy the **Web app URL** it gives you. It ends in `/exec`.

**About "Anyone":** the URL is unguessable and the script only writes, never reads back. But treat that URL like a key — share it with your team, not publicly. If it ever leaks, click **Deploy → Manage deployments → Archive** and deploy a fresh one.

## 4. Connect the form

1. Open `fna.html`.
2. Scroll to **Save this analysis** at the bottom.
3. Paste the Web app URL into the box and click out of it.
4. Fill in a client name and click **Save to Drive**. You should see "Saved to Drive. Row 2 in your FNA sheet."

The URL stays on that device only, so the HTML file itself stays safe to hand to anyone.

## 5. Put it where the team can reach it

Upload all five files together into your GitHub Pages repo, in the same folder:

```
fna.html
sw.js
manifest.webmanifest
icon-192.png
icon-512.png
```

They must sit side by side — the offline support breaks if `sw.js` is in a different folder from `fna.html`. Then it lives at `hyperionlegacy.com/fna.html`.

Each person on your team pastes the same web app URL once on their own device, and every submission lands in the one shared sheet.

## 6. Install it on each phone

Have everyone open the page once **while they have signal**. That first visit is what caches the form. After that:

- **iPhone:** Safari → Share button → Add to Home Screen
- **Android:** Chrome → menu → Install app, or Add to Home Screen

Now it opens from the home screen like an app, full screen, with no browser bar — and it opens whether or not there's a signal.

## Working without a connection

Once installed, everything except the Drive save runs offline: all the fields, all the live math, print to PDF, and saving copies to the device.

Tapping **Save to Drive** with no signal doesn't fail. The analysis goes into a queue on the phone, and the pill in the bottom corner shows how many are waiting. The moment the phone reconnects, they send themselves and the pill clears. You can also tap **Send now** to push them manually.

**Worth knowing:** iOS clears website data for sites you haven't opened in about a week — but not for sites added to the Home Screen. Tell the team to install it rather than bookmark it. Either way, **Save a copy on this device** and **Download backup file** are there for anything you can't afford to lose.

## When you change fna.html

Phones will keep serving the cached copy until you tell them otherwise. Open `sw.js` and bump the version:

```js
var CACHE_VERSION = 'hyperion-fna-v2';   // was v1
```

Upload both files. Each phone picks up the new version the next time it opens the page with a signal.

## Troubleshooting

**I changed Code.gs and nothing happened.** Apps Script keeps serving the old version until you redeploy. Use **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**. Same URL, updated code.

**"Couldn't reach Drive."** The URL is wrong or the deployment isn't set to "Anyone." Open the URL directly in a browser — you should see `{"ok":true,...}`.

**"Drive rejected it."** Almost always a bad Sheet ID. Recheck the section between `/d/` and `/edit`.

**Nothing appears in the sheet.** Check you're looking at the tab named "FNA Submissions" — the script creates it on first write.
