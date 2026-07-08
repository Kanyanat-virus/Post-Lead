function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. ดึงข้อมูลจากชีต "รายที่ทำการ"
    var branchSheet = ss.getSheetByName("รายที่ทำการ") || getSheetById(ss, 607873988);
    var branchData = branchSheet ? sheetToObjectsMultipleKeywords(branchSheet, ["จังหวัด"]) : [];

    // 2. ดึงข้อมูลจากชีต "รางวัล" (ใช้สำหรับหน้าหลัก app.js)
    var rewardSheet = ss.getSheetByName("รางวัล") || getSheetById(ss, 954814278);
    var rewardData = rewardSheet ? sheetToObjectsMultipleKeywords(rewardSheet, ["วันที่สร้าง", "เจ้าของลูกค้า", "บริษัท / บัญชี"]) : [];

    // 3. ดึงข้อมูลจากชีต "กรอกข้อมูล Lead" (ใช้สำหรับหน้ารายงาน report.js)
    var leadSheet = ss.getSheetByName("กรอกข้อมูล Lead");
    var leadData = leadSheet ? sheetToObjectsMultipleKeywords(leadSheet, ["วันที่สร้าง", "วันที่", "ที่ทำการ"]) : [];

    // 4. ดึงข้อมูลจากชีต "กรอกข้อมูลเข้าพบ" (ใช้สำหรับหน้ารายงาน report.js)
    var visitSheet = ss.getSheetByName("กรอกข้อมูลเข้าพบ");
    var visitData = visitSheet ? sheetToObjectsMultipleKeywords(visitSheet, ["วันที่", "รหัสไปรษณีย์", "ทีม"]) : [];

    var result = {
      status: "success",
      branches: branchData,
      leads: rewardData,       // ส่งออกเป็น leads เพื่อให้หน้าหลัก (app.js) ทำงานได้เหมือนเดิม
      rawLeads: leadData,      // ส่งข้อมูลดิบของ Lead ไปใช้ในหน้ารายงาน
      visits: visitData        // ส่งข้อมูลเข้าพบ ไปใช้ในหน้ารายงาน
    };

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheetById(ss, id) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() == id) {
      return sheets[i];
    }
  }
  return null;
}

// ฟังก์ชันแปลงข้อมูล Sheet เป็น Object โดยรองรับ Header หลายแบบ
function sheetToObjectsMultipleKeywords(sheet, headerKeywords) {
  var data = sheet.getDataRange().getValues();
  var headerRowIndex = -1;
  
  for (var i = 0; i < Math.min(10, data.length); i++) { // หาใน 10 บรรทัดแรก
    var rowStr = data[i].join(",");
    for (var k = 0; k < headerKeywords.length; k++) {
      if (rowStr.indexOf(headerKeywords[k]) !== -1) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex !== -1) break;
  }

  if (headerRowIndex === -1) return [];

  var headers = data[headerRowIndex];
  var result = [];
  var ssTimeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();

  for (var i = headerRowIndex + 1; i < data.length; i++) {
    var row = data[i];
    if (row.join("").trim() === "") continue;

    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var key = headers[j] ? headers[j].toString().trim() : "";
      if (key) {
        var val = row[j];
        if (val instanceof Date) {
          // ใช้ format ISO เพื่อไม่ให้เวลาเคลื่อน
          obj[key] = Utilities.formatDate(val, ssTimeZone, "yyyy-MM-dd'T'HH:mm:ss");
        } else {
          obj[key] = val !== undefined && val !== null ? val.toString().trim() : "";
        }
      }
    }
    result.push(obj);
  }

  return result;
}
