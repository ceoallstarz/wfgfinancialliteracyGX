/**
 * Hyperion Legacy Builders — FNA receiver
 *
 * Takes a submission from fna.html and does two things:
 *   1. Appends one row to a Google Sheet (one FNA per row, one column per field)
 *   2. Drops a full JSON backup into a Drive folder, so nothing is ever lost
 *
 * SETUP — three lines to fill in, then deploy. See SETUP.md.
 */

// 1. The ID of your Google Sheet. It's the long string in the sheet's URL between /d/ and /edit
var SHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE';

// 2. The tab name inside that sheet. Created automatically if it doesn't exist.
var TAB_NAME = 'FNA Submissions';

// 3. The ID of the Drive folder for JSON backups. It's the long string at the end of the folder URL.
//    Leave as '' to skip backups.
var BACKUP_FOLDER_ID = '';

// Columns pinned to the front of the sheet, in this order. Everything else follows alphabetically.
var LEAD_COLUMNS = [
  'Submitted', 'Client', 'Spouse', 'Appointment date', 'Completed by',
  'Monthly income', 'Monthly expenses', 'Discretionary income',
  'Total debt', 'Total assets', 'Net worth',
  'Death benefit in force', 'Permanent coverage', 'Term coverage'
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'Empty request' });
    }

    var payload = JSON.parse(e.postData.contents);
    var fields = payload.fields || {};
    var totals = payload.totals || {};

    var sheet = getSheet_();
    var flat = flatten_(payload, fields, totals);
    var row = writeRow_(sheet, flat);

    if (BACKUP_FOLDER_ID) {
      saveBackup_(payload);
    }

    return json({ ok: true, row: row });

  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function doGet() {
  return json({ ok: true, message: 'Hyperion FNA receiver is live.' });
}

/* ---------- helpers ---------- */

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TAB_NAME);
  }
  return sheet;
}

/** Build one flat object of column name -> value. */
function flatten_(payload, fields, totals) {
  var out = {};

  out['Submitted'] = payload.submittedAt
    ? Utilities.formatDate(new Date(payload.submittedAt), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
    : new Date();
  out['Client'] = fields.client_name || '';
  out['Spouse'] = fields.spouse_name || '';
  out['Appointment date'] = fields.appt_date || '';
  out['Completed by'] = fields.advisor_name || '';

  out['Monthly income'] = round_(totals.income);
  out['Monthly expenses'] = round_(totals.expense);
  out['Discretionary income'] = round_(totals.disc);
  out['Total debt'] = round_(totals.debtBal);
  out['Total assets'] = round_(totals.assets);
  out['Net worth'] = round_(totals.netWorth);
  out['Death benefit in force'] = round_(totals.deathBenefit);
  out['Permanent coverage'] = round_(totals.deathBenefitPermanent);
  out['Term coverage'] = round_(totals.deathBenefitTerm);

  Object.keys(fields).forEach(function (k) {
    out[k] = fields[k];
  });

  return out;
}

function round_(v) {
  var n = Number(v);
  return isFinite(n) ? Math.round(n) : 0;
}

/**
 * Append a row, growing the header as new fields appear.
 * Existing columns never move, so old rows stay aligned.
 */
function writeRow_(sheet, flat) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].filter(String)
    : [];

  if (headers.length === 0) {
    headers = LEAD_COLUMNS.slice();
  }

  var incoming = Object.keys(flat).sort();
  incoming.forEach(function (key) {
    if (headers.indexOf(key) === -1) headers.push(key);
  });

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var header = sheet.getRange(1, 1, 1, headers.length);
  header.setFontWeight('bold')
        .setBackground('#1a2a42')
        .setFontColor('#f7f3e9');
  sheet.setFrozenRows(1);

  var row = headers.map(function (h) {
    return flat.hasOwnProperty(h) ? flat[h] : '';
  });

  sheet.appendRow(row);
  return sheet.getLastRow();
}

function saveBackup_(payload) {
  var folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
  var name = 'FNA ' + (payload.label || 'submission') + '.json';
  folder.createFile(name, JSON.stringify(payload, null, 2), MimeType.PLAIN_TEXT);
}
