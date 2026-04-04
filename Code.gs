// ── MPF SPRING 2026 MASTER SCHEDULE — Apps Script ──────────────────────────
// Spreadsheet: "MPF Spring 2026 Master Schedule"
//
// Tab structure:
//   Bands      → Col A: Band Name  | B: Start Time | C: End Time  | D: Stage
//   Volunteers → Col A: Name       | B: Role        | C: Shift Start | D: Shift End
//
// DEPLOYMENT SETTINGS (required):
//   Execute as: Me
//   Who has access: Anyone  (NOT "Anyone with a Google account")
//   This allows the browser to POST without authentication.
// ────────────────────────────────────────────────────────────────────────────

// Fallback spreadsheet ID — overridden by sheetId in the POST payload.
// Replace with your actual Spreadsheet ID from the URL:
//   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

// Optional: URL to push sheet edits back to (bidirectional sync).
// Set to a webhook endpoint (e.g. Pipedream, n8n) if you need Sheet → App.
// Leave blank to disable the onEdit push.
var PUSH_URL = '';


// ── App → Sheet: handle cell writes from the web app ─────────────────────
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(d.sheetId || SPREADSHEET_ID);

    // Route to the correct tab by sheetName — required.
    // The web app always sends sheetName ('Bands' or 'Volunteers').
    // If the tab name doesn't match exactly, you'll get a "Tab not found" error —
    // open the config panel on the check-in page and correct the Sheet Tab Name.
    if (!d.sheetName) {
      throw new Error('sheetName is required. Update the check-in page config to set the Sheet Tab Name.');
    }
    var sheet = ss.getSheetByName(d.sheetName);
    if (!sheet) {
      var allTabs = ss.getSheets().map(function(s) { return s.getName(); }).join(', ');
      throw new Error('Tab "' + d.sheetName + '" not found. Available tabs: ' + allTabs);
    }

    // col can be a letter ("A", "G") or a 0-indexed integer from the app.
    // row is always 1-indexed (matches the spreadsheet row number).
    var colNum;
    if (typeof d.col === 'number') {
      colNum = d.col + 1;                               // 0-indexed → 1-indexed
    } else {
      colNum = d.col.trim().toUpperCase().charCodeAt(0) - 64; // "A"→1, "B"→2 …
    }
    var rowNum = parseInt(d.row);                       // 1-indexed from CSV

    if (!colNum || isNaN(rowNum) || rowNum < 1) {
      throw new Error('Bad col/row: ' + d.col + ' / ' + d.row);
    }

    if (d.value === '' || d.value === null || d.value === undefined) {
      sheet.getRange(rowNum, colNum).clearContent();
    } else {
      sheet.getRange(rowNum, colNum).setValue(d.value);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success', ok: true, tab: d.sheetName, row: rowNum, col: colNum }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ── Sheet → App: push edits back to a webhook (bidirectional sync) ────────
// To activate: set PUSH_URL above, then in the Apps Script editor go to
//   Triggers → Add Trigger → onEditPush → From spreadsheet → On edit.
// NOTE: this uses an installable trigger, not the simple onEdit() — simple
// onEdit cannot call external URLs (UrlFetchApp is not available).
function onEditPush(e) {
  if (!PUSH_URL) return;
  try {
    var range = e.range;
    var payload = {
      sheetName: range.getSheet().getName(),
      row:       range.getRow(),
      col:       range.getColumn(),
      value:     (e.value !== undefined ? e.value : range.getValue())
    };
    UrlFetchApp.fetch(PUSH_URL, {
      method:           'post',
      contentType:      'application/json',
      payload:          JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    console.error('onEditPush failed:', err);
  }
}


// ── Health check ──────────────────────────────────────────────────────────
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, status: 'MPF Sync active' }))
    .setMimeType(ContentService.MimeType.JSON);
}
