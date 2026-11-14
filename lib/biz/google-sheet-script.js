/**
 * ============================================================================
 * BUNTY BOT - GOOGLE SHEETS SYNC APPS SCRIPT
 * ============================================================================
 * 
 * HOW TO SET UP (Takes 2 minutes):
 * 1. Open your Google Sheet ("Sale Log").
 * 2. Click "Extensions" -> "Apps Script" in the top menu.
 * 3. Delete any default code in Code.gs and paste THIS ENTIRE FILE.
 * 4. (Optional) Set a SECRET_TOKEN below if you want extra security.
 * 5. Click "Deploy" (top right) -> "New deployment".
 * 6. Click the gear icon next to "Select type" -> choose "Web app".
 * 7. Set:
 *    - Description: Bunty Bot Sync
 *    - Execute as: Me (your Google account)
 *    - Who has access: Anyone
 * 8. Click "Deploy", authorize permissions when prompted, and COPY the "Web app URL".
 * 9. In WhatsApp, send:
 *    .biz setsheet <your-web-app-url>
 *    or add GOOGLE_SHEET_WEBAPP_URL=<your-web-app-url> in your .env file.
 * ============================================================================
 */

// Optional: Set a shared secret token if desired (leave empty to disable token check)
var SECRET_TOKEN = "";

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (SECRET_TOKEN && data.secret !== SECRET_TOKEN) {
      return responseJson({ success: false, error: "Unauthorized" });
    }

    var sheet = getTargetSheet();
    var action = data.action;

    if (action === "append_sale") {
      // Columns: Timestamp, Sold to, Brand, Colour, Other details, Sold for (₹), Who got money and how, Bunty ID
      var newRow = [
        data.timestamp || formatCurrentDate(),
        data.sold_to || "",
        data.brand || "",
        data.colour || "",
        data.other_details || "",
        data.amount || 0,
        data.money_note || "Pending",
        data.bunty_id ? String(data.bunty_id) : ""
      ];
      sheet.appendRow(newRow);
      return responseJson({ success: true, action: "appended", row: sheet.getLastRow() });
    }

    if (action === "update_payment") {
      var buntyId = String(data.bunty_id);
      var newMoneyNote = data.money_note;
      var foundRow = findRowByBuntyId(sheet, buntyId);

      if (foundRow > 0) {
        // Column 7 is "Who got money and how"
        sheet.getRange(foundRow, 7).setValue(newMoneyNote);
        return responseJson({ success: true, action: "updated", row: foundRow });
      }

      return responseJson({ success: false, error: "Sale ID not found in sheet: " + buntyId });
    }

    if (action === "void_sale") {
      var buntyId = String(data.bunty_id);
      var foundRow = findRowByBuntyId(sheet, buntyId);

      if (foundRow > 0) {
        // Mark money note as [VOIDED] and strike through the row
        var currentNote = String(sheet.getRange(foundRow, 7).getValue());
        sheet.getRange(foundRow, 7).setValue("[VOIDED] " + currentNote);
        sheet.getRange(foundRow, 1, 1, 8).setFontStrikeThrough(true);
        return responseJson({ success: true, action: "voided", row: foundRow });
      }

      return responseJson({ success: false, error: "Sale ID not found in sheet: " + buntyId });
    }

    return responseJson({ success: false, error: "Unknown action: " + action });
  } catch (err) {
    return responseJson({ success: false, error: err.toString() });
  }
}

function doGet(e) {
  try {
    var params = e.parameter || {};
    if (SECRET_TOKEN && params.secret !== SECRET_TOKEN) {
      return responseJson({ success: false, error: "Unauthorized" });
    }

    var sheet = getTargetSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return responseJson({ success: true, rows: [] });
    }

    var fromRow = parseInt(params.from_row || "2", 10);
    if (fromRow > lastRow) {
      return responseJson({ success: true, rows: [], last_row: lastRow });
    }

    var numRows = (lastRow - fromRow) + 1;
    // Read 8 columns (including Bunty ID in column 8 if present)
    var values = sheet.getRange(fromRow, 1, numRows, 8).getValues();
    var resultRows = [];

    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      var rowNumber = fromRow + i;
      resultRows.push({
        row_number: rowNumber,
        timestamp: r[0],
        sold_to: String(r[1] || "").trim(),
        brand: String(r[2] || "").trim(),
        colour: String(r[3] || "").trim(),
        other_details: String(r[4] || "").trim(),
        amount: r[5],
        money_note: String(r[6] || "Pending").trim(),
        bunty_id: String(r[7] || "").trim() // Empty if submitted via Google Form
      });
    }

    return responseJson({
      success: true,
      last_row: lastRow,
      rows: resultRows
    });
  } catch (err) {
    return responseJson({ success: false, error: err.toString() });
  }
}

function getTargetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sale Log (Responses)") || 
              ss.getSheetByName("Form Responses 1") || 
              ss.getSheets()[0];

  // Ensure header has 8th column for Bunty ID tracking
  if (sheet.getLastRow() >= 1) {
    var header8 = sheet.getRange(1, 8).getValue();
    if (!header8) {
      sheet.getRange(1, 8).setValue("Bunty ID");
    }
  }

  return sheet;
}

function findRowByBuntyId(sheet, buntyId) {
  if (!buntyId) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var ids = sheet.getRange(2, 8, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(buntyId).trim()) {
      return i + 2; // +2 for 1-based index and header row
    }
  }
  return -1;
}

function formatCurrentDate() {
  var d = new Date();
  var istOffset = 5.5 * 3600 * 1000;
  var ist = new Date(d.getTime() + istOffset);
  return Utilities.formatDate(ist, "GMT+05:30", "yyyy-MM-dd HH:mm");
}

function responseJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
