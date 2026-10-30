/**
 * =========================================================================
 * SIBIKOM - SISTEM INFORMASI BIJI KOPI MENTAH & WAREHOUSE PORTAL
 * Google Apps Script Backend (Code.gs)
 * =========================================================================
 * 
 * Skrip ini menangani komunikasi 2 arah secara penuh antara aplikasi SIBIKOM
 * dan Google Spreadsheet:
 * 1. TAMBAH DATA (CREATE) : Input baru untuk Penerimaan, Pengeluaran (FIFO),
 *                           Permintaan UPBM (Roasting), PO Supplier, & Ceklist WH.
 * 2. EDIT / UPDATE DATA   : Memperbarui baris berdasarkan ID_PERMINTAAN, ID_LOT,
 *                           ID_KELUAR, NO_PO, atau kolom ID lainnya.
 * 3. HAPUS DATA (DELETE)  : Menghapus baris dari Google Sheet secara permanen
 *                           berdasarkan ID unik.
 * 4. BACA DATA (READ/GET) : Membaca data dalam format JSON / JSONP (anti CORS).
 * 
 * PANDUAN INSTALASI:
 * 1. Buka Google Spreadsheet SIBIKOM Anda.
 * 2. Klik menu "Ekstensi" (Extensions) -> "Apps Script".
 * 3. Hapus seluruh isi default pada Code.gs, lalu paste seluruh isi file ini.
 * 4. Klik tombol "Simpan" (Save / Ikon Disket).
 * 5. Klik tombol biru "Terapkan" (Deploy) -> "Penerapan baru" (New deployment).
 * 6. Pilih jenis: "Aplikasi Web" (Web app).
 * 7. Konfigurasi penting:
 *    - Deskripsi : SIBIKOM Backend API v2
 *    - Jalankan sebagai (Execute as) : Saya (Me / email Anda)
 *    - Yang memiliki akses (Who has access) : Siapa saja (Anyone)
 * 8. Klik "Terapkan" (Deploy), berikan izin otorisasi (Review permissions),
 *    lalu salin "URL Aplikasi Web" (Web App URL).
 * 9. Tempelkan URL tersebut ke menu Pengaturan Google Sheet di aplikasi SIBIKOM.
 * =========================================================================
 */

// Konstanta Nama-Nama Sheet Standar SIBIKOM
var SHEET_NAMES = {
  PERMINTAAN: "FORM_PERMINTAAN_UPBM",
  PENERIMAAN: "INPUT_PENERIMAAN_KOPI",
  PENGELUARAN: "INPUT_TRANSAKSI_KELUAR",
  PO: "INPUT_PO_SUPPLIER",
  CEKLIST: "DATA_CEKLIST_WAREHOUSE",
  OPER: "INPUT_OPER_GUDANG",
  OPNAME_PALLET: "STOCK_OPNAME_PALLET_GBB"
};

/**
 * 1. doGet: Menerima request GET dari aplikasi SIBIKOM
 * Digunakan untuk:
 * - Ping / tes koneksi (?action=ping)
 * - Baca data sheet secara dinamis (?action=read&sheetName=FORM_PERMINTAAN_UPBM)
 * - Ceklist Warehouse
 */
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var action = (p.action || "").toLowerCase();
  var callback = p.callback;

  try {
    var targetSpreadsheetId = String(p.spreadsheetId || p.sheetId || p.spreadsheet_id || "").trim();
    var ss;
    if (targetSpreadsheetId) {
      try {
        ss = SpreadsheetApp.openById(targetSpreadsheetId);
      } catch (openErr) {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      }
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    // 1A. Tes Koneksi / Ping
    if (action === "ping" || action === "test") {
      return makeResponse({
        status: "success",
        message: "Koneksi Google Apps Script SIBIKOM Aktif & Siap Digunakan!",
        spreadsheetName: ss.getName(),
        spreadsheetId: ss.getId(),
        timestamp: Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss") + " WIB"
      }, callback);
    }

    // 1B. Breakdown Data Kolom D (Pecah JSON Pallet ke Tabel Rapi)
    if (action === "breakdown" || action === "breakdown_pallet" || action === "breakdown_kolom_d") {
      try {
        var breakdownResGet = breakdownKolomDPallet(ss, p.sheetName || p.sheet, p.col ? parseInt(p.col) : 4);
        return makeResponse(breakdownResGet, callback);
      } catch (bdErr) {
        return makeResponse({
          status: "error",
          message: "Gagal memecah kolom D: " + bdErr.message
        }, callback);
      }
    }

    // 1B-2. Konversi Base64 Foto Pallet & Sinkronkan Kolom L, M, N (Dokumentasi, PIC, Resume Tanggal)
    if (action === "convert_pallet_photos" || action === "convert_photos" || action === "convert_base64" || action === "sync_pallet_columns" || action === "fill_missing_pallet_data") {
      try {
        var convertResGet = syncAndFillPalletColumns(ss, p.sheetName || "STOCK_OPNAME_PALLET_GBB", p);
        return makeResponse(convertResGet, callback);
      } catch (convErrGet) {
        return makeResponse({
          status: "error",
          message: "Gagal sinkronkan kolom pallet: " + convErrGet.message
        }, callback);
      }
    }

    // 1C. Baca Data Sheet Tertentu (Format JSON)
    var targetSheetName = p.sheetName || p.sheet;
    // Dukung juga action khusus ceklist jika diminta
    if (action === "ceklist" || action === "checklist") {
      targetSheetName = targetSheetName || SHEET_NAMES.CEKLIST;
    }

    if (targetSheetName) {
      var sheet = getSheetByNameCaseInsensitive(ss, targetSheetName);
      if (!sheet) {
        // Jika sheet ceklist belum ada, coba inisialisasi atau cari sheet tanggapan formulir
        if (targetSheetName === SHEET_NAMES.CEKLIST || targetSheetName === "DATA_CEKLIST_WAREHOUSE") {
          sheet = setupCeklistSheet(ss);
        } else {
          return makeResponse({
            status: "error",
            message: "Sheet '" + targetSheetName + "' tidak ditemukan di spreadsheet ini."
          }, callback);
        }
      }

      var data = readSheetDataAsJSON(sheet);
      return makeResponse({
        status: "success",
        sheetName: sheet.getName(),
        total: data.length,
        timestamp: Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss") + " WIB",
        data: data
      }, callback);
    }

    // 1C. Default jika tanpa parameter: Berikan ringkasan sheet yang tersedia
    var allSheets = ss.getSheets().map(function(s) { return s.getName(); });
    return makeResponse({
      status: "success",
      message: "SIBIKOM Web App Backend is running.",
      sheets: allSheets
    }, callback);

  } catch (err) {
    return makeResponse({
      status: "error",
      message: "Gagal memproses GET: " + err.toString()
    }, callback);
  }
}

/**
 * 2. doPost: Menerima request POST dari aplikasi SIBIKOM
 * Mendukung aksi:
 * - action='edit'   : Memperbarui baris data berdasarkan ID
 * - action='delete' : Menghapus baris data berdasarkan ID
 * - action='add'    : Menambah baris baru (default jika action tidak dispesifikasikan)
 */
function doPost(e) {
  // Gunakan LockService agar operasi baca-tulis tidak bentrok saat banyak user
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    try {
      hasLock = lock.tryLock(8000); // Coba dapatkan kunci max 8 detik
    } catch (eLock) {
      hasLock = false;
    }

    var p = {};

    // 2A. Parsing parameter (dukung format x-www-form-urlencoded, FormData & JSON body)
    if (e && e.parameter) {
      for (var k in e.parameter) {
        p[k] = e.parameter[k];
      }
    }
    if (e && e.postData && e.postData.contents) {
      try {
        var jsonBody = JSON.parse(e.postData.contents);
        for (var jk in jsonBody) {
          p[jk] = jsonBody[jk];
        }
      } catch (ex) {
        // Abaikan jika bukan JSON murni
      }
    }

    var targetSpreadsheetId = String(p.spreadsheetId || p.sheetId || p.spreadsheet_id || "").trim();
    var ss;
    if (targetSpreadsheetId) {
      try {
        ss = SpreadsheetApp.openById(targetSpreadsheetId);
      } catch (openErr) {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      }
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    var action = (p.action || "add").toLowerCase();
    var sheetName = p.sheetName || p.sheet || SHEET_NAMES.PERMINTAAN;
    var sheet = getSheetByNameCaseInsensitive(ss, sheetName);

    if (!sheet) {
      // Inisialisasi otomatis jika sheet Ceklist, Oper Gudang, atau Opname Pallet belum ada
      if (sheetName === SHEET_NAMES.CEKLIST || sheetName === "DATA_CEKLIST_WAREHOUSE") {
        sheet = setupCeklistSheet(ss);
      } else if (sheetName === SHEET_NAMES.OPER) {
        sheet = setupOperGudangSheet(ss);
      } else if (sheetName === SHEET_NAMES.OPNAME_PALLET || sheetName === "STOCK_OPNAME_PALLET_GBB" || sheetName === "DATA_STOCK_OPNAME_PALLET") {
        sheet = setupOpnamePalletSheet(ss);
      } else {
        return makeResponse({
          status: "error",
          message: "Sheet dengan nama '" + sheetName + "' tidak ditemukan di spreadsheet."
        });
      }
    }

    // =========================================================================
    // AKSI 0: PECAH / BREAKDOWN DATA KOLOM D (action: 'breakdown' / 'breakdown_pallet')
    // =========================================================================
    if (action === "breakdown" || action === "breakdown_pallet" || action === "breakdown_kolom_d") {
      try {
        var bdResPost = breakdownKolomDPallet(ss, sheetName, p.col ? parseInt(p.col) : 4);
        return makeResponse(bdResPost);
      } catch (errPostBd) {
        return makeResponse({
          status: "error",
          message: "Gagal memecah kolom D: " + errPostBd.message
        });
      }
    }

    // =========================================================================
    // AKSI 0B: KONVERSI BASE64 FOTO PALLET KE LINK DRIVE (action: 'convert_pallet_photos')
    // =========================================================================
    if (action === "convert_pallet_photos" || action === "convert_photos" || action === "convert_base64" || action === "sync_pallet_columns" || action === "fill_missing_pallet_data") {
      try {
        var convPostRes = syncAndFillPalletColumns(ss, sheetName || "STOCK_OPNAME_PALLET_GBB", p);
        return makeResponse(convPostRes);
      } catch (errConvPost) {
        return makeResponse({
          status: "error",
          message: "Gagal sinkronkan kolom pallet: " + errConvPost.message
        });
      }
    }

    // =========================================================================
    // AKSI 1: HAPUS DATA (action: 'delete' / 'hapus')
    // =========================================================================
    if (action === "delete" || action === "hapus") {
      var targetId = String(p.id || p.ID || p.targetId || "").trim();
      var keyColName = (p.columnName || p.col || "").trim();

      // Jika targetId kosong, coba ambil dari nomor palet atau parameter lainnya
      if (!targetId) {
        targetId = String(p.NO_PALET || p.noPalet || p.noPallet || p.nomorPalet || "").trim();
      }

      // Jika columnName tidak dikirim, tebak kolom ID utama berdasarkan sheetName
      if (!keyColName) {
        if (sheetName === SHEET_NAMES.PERMINTAAN) keyColName = "ID_PERMINTAAN";
        else if (sheetName === SHEET_NAMES.PENERIMAAN) keyColName = "ID_LOT";
        else if (sheetName === SHEET_NAMES.PENGELUARAN) keyColName = "ID_KELUAR";
        else if (sheetName === SHEET_NAMES.PO) keyColName = "NO_PO";
        else if (sheetName === SHEET_NAMES.OPER) keyColName = "ID_OPER";
        else if (sheetName === SHEET_NAMES.OPNAME_PALLET || sheetName === "STOCK_OPNAME_PALLET_GBB" || sheetName === "DATA_STOCK_OPNAME_PALLET") keyColName = "ID";
        else if (sheetName === SHEET_NAMES.CEKLIST) keyColName = "Timestamp";
        else keyColName = "ID";
      }

      // Jika targetId masih kosong, coba ambil dari keyColName
      if (!targetId && p[keyColName]) {
        targetId = String(p[keyColName]).trim();
      }

      if (!targetId) {
        return makeResponse({
          status: "error",
          message: "Parameter 'id' atau 'noPalet' yang akan dihapus tidak boleh kosong."
        });
      }

      var lastRow = sheet.getLastRow();
      if (lastRow < 1) {
        return makeResponse({
          status: "error",
          message: "Sheet '" + sheetName + "' masih kosong, tidak ada data untuk dihapus."
        });
      }

      // Cari baris yang akan dihapus menggunakan multi-strategy helper (mendukung baris 1 s/d lastRow)
      var rowToDelete = findTargetRowInSheet(sheet, p, targetId, keyColName, sheetName);

      if (rowToDelete === -999) {
        deleteFromRapiSheet(ss, targetId, p.NO_PALET || p.noPalet);
        return makeResponse({
          status: "success",
          action: "delete",
          sheetName: sheetName,
          id: targetId,
          deletedCount: 1,
          message: "Berhasil menghapus data palet " + (p.NO_PALET || targetId) + " dari Google Sheet!"
        });
      }

      if (rowToDelete >= 1 && rowToDelete <= lastRow) {
        safelyDeleteOrClearRow(sheet, rowToDelete);
        deleteFromRapiSheet(ss, targetId, p.NO_PALET || p.noPalet);
        return makeResponse({
          status: "success",
          action: "delete",
          sheetName: sheetName,
          id: targetId,
          deletedRow: rowToDelete,
          deletedCount: 1,
          message: "Berhasil menghapus data pada baris " + rowToDelete + " (ID/No: " + targetId + ") dari Google Sheet!"
        });
      }

      // Fallback penghapusan backward jika rowToDelete belum ditemukan
      var lastCol = Math.max(1, sheet.getLastColumn());
      var deletedCount = 0;
      var tsFallbackSearch = String(p.timestamp || p.waktu || targetId).trim();
      var noPaletFallback = String(p.NO_PALET || p.noPalet || p.nomorPalet || "").trim().toLowerCase();

      // Scan seluruh baris mundur dari baris terakhir sampai baris 1
      for (var rCheck = lastRow; rCheck >= 1; rCheck--) {
        var rowVals = sheet.getRange(rCheck, 1, 1, lastCol).getValues()[0];
        var rowDisps = sheet.getRange(rCheck, 1, 1, lastCol).getDisplayValues()[0];
        var matchFound = false;

        // Jika rCheck adalah baris 1, jangan hapus jika itu baris judul header resmi (dan sheet memiliki baris data lain)
        if (rCheck === 1 && lastRow > 1 && isGenericHeaderRow(rowDisps)) {
          continue;
        }

        for (var cK = 0; cK < lastCol; cK++) {
          var cRaw = String(rowVals[cK] || "").trim().toLowerCase();
          var cDsp = String(rowDisps[cK] || "").trim().toLowerCase();
          if (targetId && (cDsp === targetId.toLowerCase() || cRaw === targetId.toLowerCase())) {
            matchFound = true;
            break;
          }
          if (noPaletFallback && (cDsp === noPaletFallback || cRaw === noPaletFallback)) {
            matchFound = true;
            break;
          }
          if (tsFallbackSearch && isSameDateOrTimestamp(rowVals[cK], rowDisps[cK], tsFallbackSearch)) {
            matchFound = true;
            break;
          }
        }

        if (matchFound) {
          safelyDeleteOrClearRow(sheet, rCheck);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        deleteFromRapiSheet(ss, targetId, p.NO_PALET || p.noPalet);
        return makeResponse({
          status: "success",
          action: "delete",
          sheetName: sheetName,
          id: targetId,
          deletedCount: deletedCount,
          message: "Berhasil menghapus " + deletedCount + " baris data dengan ID/No: " + targetId + " dari Google Sheet!"
        });
      } else {
        return makeResponse({
          status: "not_found",
          sheetName: sheetName,
          id: targetId,
          message: "Data dengan ID/No '" + targetId + "' tidak ditemukan pada sheet '" + sheetName + "'."
        });
      }
    }

    // =========================================================================
    // AKSI 2: EDIT DATA (action: 'edit' / 'update' / 'update_ceklist')
    // =========================================================================
    if (action === "edit" || action === "update" || action === "update_ceklist") {
      var targetIdEdit = String(p.id || p.ID || p.targetId || "").trim();
      var keyColNameEdit = (p.columnName || p.col || "").trim();

      if (!keyColNameEdit) {
        if (sheetName === SHEET_NAMES.PERMINTAAN) keyColNameEdit = "ID_PERMINTAAN";
        else if (sheetName === SHEET_NAMES.PENERIMAAN) keyColNameEdit = "ID_LOT";
        else if (sheetName === SHEET_NAMES.PENGELUARAN) keyColNameEdit = "ID_KELUAR";
        else if (sheetName === SHEET_NAMES.PO) keyColNameEdit = "NO_PO";
        else if (sheetName === SHEET_NAMES.OPER) keyColNameEdit = "ID_OPER";
        else if (sheetName === SHEET_NAMES.CEKLIST) keyColNameEdit = "Timestamp";
        else keyColNameEdit = "ID";
      }

      if (!targetIdEdit && p[keyColNameEdit]) {
        targetIdEdit = String(p[keyColNameEdit]).trim();
      }

      if (!targetIdEdit) {
        return makeResponse({
          status: "error",
          message: "Parameter 'id' yang akan diedit tidak boleh kosong."
        });
      }

      var lastRowEdit = sheet.getLastRow();
      if (lastRowEdit < 2) {
        return makeResponse({
          status: "error",
          message: "Sheet '" + sheetName + "' masih kosong, tidak ada baris untuk diedit."
        });
      }

      var targetRowIdx = findTargetRowInSheet(sheet, p, targetIdEdit, keyColNameEdit, sheetName);

      if (targetRowIdx < 2 || targetRowIdx > lastRowEdit) {
        return makeResponse({
          status: "not_found",
          sheetName: sheetName,
          id: targetIdEdit,
          message: "Data dengan ID '" + targetIdEdit + "' tidak ditemukan untuk diperbarui."
        });
      }

      var lastColEdit = sheet.getLastColumn();
      var headersEdit = sheet.getRange(1, 1, 1, lastColEdit).getValues()[0];

      // Petakan dan update nilai per kolom header
      var updatedFields = [];
      for (var colI = 0; colI < headersEdit.length; colI++) {
        var headerKey = String(headersEdit[colI]).trim();
        if (!headerKey) continue;

        // Cek parameter nilai dengan pencocokan fleksibel & alias
        var val = findParamValue(p, headerKey);

        // Jika bernilai undefined/kosong dan ada batchData, cek objek item pertama
        if ((val === undefined || val === null || val === "") && p.batchData) {
          try {
            var bItems = JSON.parse(p.batchData);
            if (Array.isArray(bItems) && bItems.length > 0) {
              val = findParamValue(bItems[0], headerKey);
            }
          } catch (eBatch) {}
        }

        // Cek khusus jika sheet adalah palet atau kolom Dokumentasi, PIC, Resume Tanggal
        var hNorm = headerKey.replace(/[\s_()-]/g, '').toLowerCase();
        if ((hNorm === "dokumentasi" || hNorm === "buktifoto" || hNorm === "foto") && (val === undefined || val === null || val === "")) {
          val = p.Dokumentasi || p.foto || p.BUKTI_FOTO || p.dokumentasi || "";
        }
        if ((hNorm === "pic" || hNorm === "auditor" || hNorm === "auditorpic") && (val === undefined || val === null || val === "")) {
          val = p.PIC || p.auditor || p.AUDITOR_PIC || p.pic || "";
        }
        if ((hNorm === "resumetanggal" || hNorm === "timestamp") && (val === undefined || val === null || val === "")) {
          val = p.Resume_Tanggal || p["Resume Tanggal"] || p.resumetanggal || p.tglAudit || p.TANGGAL_STOCK_OPNAME || p.timestamp || (Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss") + " WIB");
        }

        if (val !== undefined && val !== null) {
          var formattedVal = formatValueForSheet(headerKey, val);
          sheet.getRange(targetRowIdx, colI + 1).setValue(formattedVal);
          updatedFields.push(headerKey);
        }
      }

      return makeResponse({
        status: "success",
        action: "edit",
        sheetName: sheetName,
        id: targetIdEdit,
        rowNumber: targetRowIdx,
        updatedFields: updatedFields,
        message: "Data ID " + targetIdEdit + " berhasil diperbarui di Google Sheet!"
      });
    }

    // =========================================================================
    // AKSI 3: TAMBAH DATA BARU (action: 'add' / DEFAULT)
    // =========================================================================
    var newRow = [];

    if (sheetName === SHEET_NAMES.PERMINTAAN) {
      // Struktur FORM_PERMINTAAN_UPBM (16 Kolom: A s/d P)
      // A: ID_PERMINTAAN
      // B: TANGGAL_PERMINTAAN
      // C: JAM_PERMINTAAN
      // D: SHIFT
      // E: PEMINTA
      // F: UNIT
      // G: JENIS_KOPI
      // H: QTY_PERMINTAAN_NETTO_KG
      // I: PRIORITAS
      // J: STATUS_PERMINTAAN
      // K: TOTAL_REALISASI_KG
      // L: SISA_PERMINTAAN_KG
      // M: PERSEN_REALISASI
      // N: TANGGAL_SELESAI
      // O: KETERANGAN
      // P: VALID_REQUEST

      var idPermintaan = p.ID_PERMINTAAN || p.id || ("REQ-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd") + "-001");
      var tglPermintaan = p.TANGGAL_PERMINTAAN || Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
      var jamPermintaan = p.JAM_PERMINTAAN || Utilities.formatDate(new Date(), "Asia/Jakarta", "HH:mm:ss");
      var shift = p.SHIFT || "SHIFT 1";
      var peminta = p.PEMINTA || "Operator UPBM";
      var unit = p.UNIT || "UPBM";
      var jenisKopi = p.JENIS_KOPI || "18";
      var qtyPermintaan = parseNumberSafe(p.QTY_PERMINTAAN_NETTO_KG);
      var prioritas = p.PRIORITAS || "Normal";
      var totalReal = parseNumberSafe(p.TOTAL_REALISASI_KG);
      var sisaPermintaan = (qtyPermintaan > totalReal) ? (qtyPermintaan - totalReal) : 0;
      var statusPermintaan = p.STATUS_PERMINTAAN || (totalReal >= qtyPermintaan ? "COMPLETED" : (totalReal > 0 ? "PARTIAL" : "OPEN"));
      var persenReal = qtyPermintaan > 0 ? (totalReal / qtyPermintaan) : 0;
      var tglSelesai = p.TANGGAL_SELESAI || "";
      var keterangan = p.KETERANGAN || "";
      var validRequest = p.VALID_REQUEST || "VALID";

      newRow = [
        idPermintaan,
        tglPermintaan,
        jamPermintaan,
        shift,
        peminta,
        unit,
        jenisKopi,
        qtyPermintaan,
        prioritas,
        statusPermintaan,
        totalReal,
        sisaPermintaan,
        persenReal,
        tglSelesai,
        keterangan,
        validRequest
      ];

      sheet.appendRow(newRow);

    } else if (sheetName === SHEET_NAMES.CEKLIST) {
      // Struktur Ceklist Warehouse 16 Kolom (A s/d P)
      var timestamp = p.timestamp || p.waktu || Utilities.formatDate(new Date(), "Asia/Jakarta", "M/d/yyyy HH:mm:ss");
      var inspector = p.petugas || p.namaWarehouseInspektor || p.nama || "";
      var tglInspeksi = p.tanggal || p.tanggalInspeksi || Utilities.formatDate(new Date(), "Asia/Jakarta", "M/d/yyyy");
      var bagian = p.bagian || "GBB";
      var area = p.area || "";
      var nomorGudang = p.nomorGudang || p.nomor_gudang || "";
      var kategoriAudit = p.kategoriAudit || p.kategori || "5 R";
      var tingkatKeparahan = p.tingkatKeparahan || p.keparahan || "Low";
      var foto1 = saveBase64ToDriveFolder(p.foto1 || p.dokumentasiFoto1 || "", "SIBIKOM_FOTO_CEKLIST", "Foto_Ceklist1_");
      var foto2 = saveBase64ToDriveFolder(p.foto2 || p.dokumentasiFoto2 || "", "SIBIKOM_FOTO_CEKLIST", "Foto_Ceklist2_");
      var deskripsi = p.deskripsi || p.diskripsiTemuan || "";
      var tindakan = p.tindakan || p.tindakanPerbaikan || "";
      var pic = p.pic || "";
      var targetSelesai = p.targetSelesai || "";
      var status = p.status || "Open";
      var email = p.email || p.emailAddress || "";

      newRow = [
        timestamp, inspector, tglInspeksi, bagian, area, nomorGudang,
        kategoriAudit, tingkatKeparahan, foto1, foto2, deskripsi,
        tindakan, pic, targetSelesai, status, email
      ];
      sheet.appendRow(newRow);

    } else if (sheetName === SHEET_NAMES.OPNAME_PALLET || sheetName === "STOCK_OPNAME_PALLET_GBB" || sheetName === "DATA_STOCK_OPNAME_PALLET") {
      // Struktur STOCK_OPNAME_PALLET_GBB (14 Kolom: A s/d N)
      var batchRows = [];
      if (p.batchData) {
        try {
          batchRows = JSON.parse(p.batchData);
        } catch (err) {
          batchRows = [];
        }
      } else if (Array.isArray(p.items)) {
        batchRows = p.items;
      }

      var existingHeaders = [];
      if (sheet.getLastRow() >= 1) {
        existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 14)).getValues()[0];
      }

      function buildPalletRow(headers, item, pObj, index) {
        var rowId = item.id || item.ID || ("PLT-" + (Date.now() + index));
        var tgl = item.tglAudit || item.TANGGAL_STOCK_OPNAME || (pObj ? (pObj.tglAudit || pObj.TANGGAL_STOCK_OPNAME) : "") || Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
        var noPlt = item.noPalet || item.NO_PALET || item.noPallet || (pObj ? (pObj.noPalet || pObj.NO_PALET) : "") || "";
        var bin = item.slotRak || item.AREA_POSISI_BIN || item.lokasi || (pObj ? (pObj.slotRak || pObj.AREA_POSISI_BIN) : "") || "";
        var gdg = item.gudang || item.GUDANG || (pObj ? pObj.gudang : "") || "Gudang SJA 3";
        var jns = item.jenisPallet || item.JENIS_PALLET || (pObj ? pObj.jenisPallet : "") || "Pallet Kayu";
        var muatan = item.statusMuatan || item.STATUS_MUATAN || (pObj ? pObj.statusMuatan : "") || "TERISI";
        var fisik = item.kondisiFisik || item.KONDISI_FISIK || (pObj ? pObj.kondisiFisik : "") || "TIDAK_RUSAK";
        var kebersihan = item.kondisiKebersihan || item.KONDISI_KEBERSIHAN || (pObj ? pObj.kondisiKebersihan : "") || "BERSIH";
        var kondisi = item.kondisi || item.STATUS_KONDISI || (pObj ? pObj.kondisi : "") || (fisik === "RUSAK" ? "PERBAIKAN" : "BAIK");
        var ctt = item.catatan || item.CATATAN || (pObj ? pObj.catatan : "") || "";
        var rawFoto = item.foto || item.BUKTI_FOTO || item.Dokumentasi || (pObj ? (pObj.foto || pObj.BUKTI_FOTO || pObj.Dokumentasi) : "") || "";
        var foto = saveBase64ToDriveFolder(rawFoto, "SIBIKOM_FOTO_PALLET", "Foto_Pallet_" + (noPlt || rowId) + "_");
        var picPlt = item.auditor || item.AUDITOR_PIC || item.PIC || (pObj ? (pObj.auditor || pObj.AUDITOR_PIC || pObj.PIC) : "") || "PIC Gudang";
        var ts = item.tglAudit || (pObj ? (pObj.Resume_Tanggal || pObj.tglAudit) : "") || (Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss") + " WIB");

        if (!headers || headers.length === 0 || !headers[0]) {
          return [rowId, tgl, noPlt, bin, gdg, jns, muatan, fisik, kebersihan, kondisi, ctt, foto, picPlt, ts];
        }

        var row = [];
        for (var c = 0; c < headers.length; c++) {
          var h = String(headers[c] || "").trim();
          var hNorm = h.replace(/[\s_()-]/g, '').toLowerCase();
          var val = findParamValue(item, h);
          if (val === undefined || val === null || val === "") {
            val = findParamValue(pObj, h);
          }

          if (hNorm === "dokumentasi" || hNorm === "buktifoto" || hNorm === "foto" || c === 11) {
            row.push(foto || (val ? saveBase64ToDriveFolder(val, "SIBIKOM_FOTO_PALLET", "Foto_Pallet_" + (noPlt || rowId) + "_") : ""));
          } else if (hNorm === "pic" || hNorm === "auditor" || hNorm === "auditorpic" || c === 12) {
            row.push(val || picPlt);
          } else if (hNorm === "resumetanggal" || hNorm === "timestamp" || c === 13) {
            row.push(val || ts);
          } else if (hNorm === "nopalet" || hNorm === "nopallet" || c === 2) {
            row.push(val || noPlt);
          } else if (hNorm === "areaposisibin" || hNorm === "slotrak" || c === 3) {
            row.push(val || bin);
          } else if (hNorm === "gudang" || c === 4) {
            row.push(val || gdg);
          } else if (hNorm === "jenispallet" || c === 5) {
            row.push(val || jns);
          } else if (hNorm === "statusmuatan" || c === 6) {
            row.push(val || muatan);
          } else if (hNorm === "kondisifisik" || c === 7) {
            row.push(val || fisik);
          } else if (hNorm === "kondisikebersihan" || c === 8) {
            row.push(val || kebersihan);
          } else if (hNorm === "statuskondisi" || hNorm === "kondisi" || c === 9) {
            row.push(val || kondisi);
          } else if (hNorm === "catatan" || c === 10) {
            row.push(val || ctt);
          } else if (hNorm === "id" || c === 0) {
            row.push(val || rowId);
          } else if (hNorm === "tanggalstockopname" || hNorm === "tglaudit" || c === 1) {
            row.push(val || tgl);
          } else {
            row.push(formatValueForSheet(h, val !== undefined ? val : ""));
          }
        }
        return row;
      }

      if (Array.isArray(batchRows) && batchRows.length > 0) {
        var rowsToAppend = [];
        for (var b = 0; b < batchRows.length; b++) {
          rowsToAppend.push(buildPalletRow(existingHeaders, batchRows[b], p, b));
        }

        if (rowsToAppend.length > 0) {
          var startRow = sheet.getLastRow() + 1;
          var colCount = rowsToAppend[0].length;
          sheet.getRange(startRow, 1, rowsToAppend.length, colCount).setValues(rowsToAppend);
          newRow = rowsToAppend[rowsToAppend.length - 1];
        }
      } else {
        newRow = buildPalletRow(existingHeaders, p, p, 0);
        sheet.appendRow(newRow);
      }

    } else {
      // Sheet lainnya (Penerimaan, Pengeluaran, PO): Petakan sesuai header yang ada
      var lastColGeneric = sheet.getLastColumn();
      if (lastColGeneric > 0) {
        var genericHeaders = sheet.getRange(1, 1, 1, lastColGeneric).getValues()[0];
        newRow = genericHeaders.map(function(h) {
          var hName = String(h).trim();
          if (p.hasOwnProperty(hName)) {
            return formatValueForSheet(hName, p[hName]);
          }
          return "";
        });
        sheet.appendRow(newRow);
      } else {
        // Jika sheet kosong, append langsung nilai object
        var rowObjVals = [];
        for (var key in p) {
          if (key !== "action" && key !== "sheetName") rowObjVals.push(p[key]);
        }
        sheet.appendRow(rowObjVals);
      }
    }

    return makeResponse({
      status: "success",
      action: "add",
      sheetName: sheetName,
      message: "Data baru berhasil ditambahkan ke sheet " + sheetName,
      row: newRow
    });

  } catch (err) {
    return makeResponse({
      status: "error",
      message: "Gagal memproses POST: " + err.toString()
    });
  } finally {
    if (hasLock) {
      try {
        lock.releaseLock();
      } catch (eRel) {}
    }
  }
}

// =========================================================================
// FUNGSI BANTUAN (HELPER FUNCTIONS)
// =========================================================================

/**
 * Format respon ke JSON dengan header CORS lengkap
 */
function makeResponse(dataObj, callback) {
  var jsonString = JSON.stringify(dataObj);
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + jsonString + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Parsing angka dari format Indonesia (1.250,50 atau 1250.50)
 */
function parseNumberSafe(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  var str = String(val).trim();
  if (str.indexOf(",") > -1 && str.indexOf(".") > -1) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (str.indexOf(",") > -1) {
    str = str.replace(",", ".");
  }
  var num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Helper untuk pencocokan tanggal dan timestamp fleksibel
 * Mampu mencocokkan format "10/6/2026 11:15:28", "10/06/2026 11:15:28", Date Object, dsb.
 */
function isSameDateOrTimestamp(cellVal, cellDisplay, searchVal) {
  if (!searchVal) return false;
  var sClean = String(searchVal).trim();
  var sLower = sClean.toLowerCase();
  
  // 1. Pencocokan langsung teks terformat pada layar
  var dClean = String(cellDisplay || "").trim();
  if (dClean === sClean || dClean.toLowerCase() === sLower) return true;
  
  // 2. Normalisasi digit (menghilangkan awalan 0 pada bulan/tanggal: misal "10/06/2026" vs "10/6/2026")
  var norm = function(str) {
    return String(str || "").replace(/\b0([1-9])\b/g, '$1').replace(/[\/\.-]/g, '/').replace(/\s+/g, ' ').trim();
  };
  if (norm(dClean) === norm(sClean)) return true;
  
  // 3. Substring check jika panjang karakter memadai
  if (sLower.length >= 8 && dClean.toLowerCase().indexOf(sLower) > -1) return true;
  if (dClean.length >= 8 && sLower.indexOf(dClean.toLowerCase()) > -1) return true;

  // 4. Ekstraksi komponen angka tahun dan jam:menit:detik
  var cNums = (dClean.match(/\d+/g) || []);
  var sNums = (sClean.match(/\d+/g) || []);
  if (cNums.length >= 5 && sNums.length >= 5) {
    var cYear = "";
    var sYear = "";
    for (var cy = 0; cy < cNums.length; cy++) { if (cNums[cy].length === 4) cYear = cNums[cy]; }
    for (var sy = 0; sy < sNums.length; sy++) { if (sNums[sy].length === 4) sYear = sNums[sy]; }
    if (cYear && sYear && cYear === sYear) {
      var cTime = cNums.slice(-3).join(":");
      var sTime = sNums.slice(-3).join(":");
      if (cTime === sTime) return true;
    }
  }

  // 5. Perbandingan jika sel berupa JavaScript Date Object
  if (cellVal instanceof Date && !isNaN(cellVal.getTime())) {
    var cTimeVal = cellVal.getTime();
    var pDate = new Date(sClean);
    if (!isNaN(pDate.getTime())) {
      if (Math.abs(cTimeVal - pDate.getTime()) < 3000) return true;
    }
    // Coba format ke timezone Jakarta
    var f1 = Utilities.formatDate(cellVal, "Asia/Jakarta", "M/d/yyyy HH:mm:ss");
    var f2 = Utilities.formatDate(cellVal, "Asia/Jakarta", "M/d/yyyy H:m:s");
    var f3 = Utilities.formatDate(cellVal, "Asia/Jakarta", "d/M/yyyy HH:mm:ss");
    var f4 = Utilities.formatDate(cellVal, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
    if (norm(f1) === norm(sClean) || norm(f2) === norm(sClean) || norm(f3) === norm(sClean) || norm(f4) === norm(sClean)) {
      return true;
    }
  }

  return false;
}

/**
 * Mencari Sheet dengan perbandingan nama yang toleran spasi dan huruf besar-kecil
 */
function getSheetByNameCaseInsensitive(ss, name) {
  if (!ss || !name) return null;
  var direct = ss.getSheetByName(name);
  if (direct) return direct;
  
  var norm = String(name).replace(/[\s_()-]/g, '').toLowerCase();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var curName = sheets[i].getName();
    if (curName.replace(/[\s_()-]/g, '').toLowerCase() === norm) {
      return sheets[i];
    }
  }
  // Khusus Ceklist jika nama tab mengandung kata ceklist / checklist / respons / formulir
  if (norm.indexOf("ceklist") > -1 || norm.indexOf("checklist") > -1 || norm.indexOf("respons") > -1 || norm.indexOf("formulir") > -1 || norm.indexOf("response") > -1) {
    for (var j = 0; j < sheets.length; j++) {
      var sLow = sheets[j].getName().toLowerCase();
      if (sLow.indexOf("ceklist") > -1 || sLow.indexOf("checklist") > -1 ||
          sLow.indexOf("respons") > -1 || sLow.indexOf("formulir") > -1 || sLow.indexOf("response") > -1) {
        return sheets[j];
      }
    }
    // Deteksi berdasarkan header inspeksi
    for (var h = 0; h < sheets.length; h++) {
      var sh = sheets[h];
      if (sh.getLastRow() >= 1) {
        var hRow = sh.getRange(1, 1, 1, Math.min(sh.getLastColumn(), 16)).getValues()[0];
        var hStr = hRow.join(" ").toLowerCase();
        if (hStr.indexOf("inspektor") !== -1 || hStr.indexOf("temuan") !== -1 || hStr.indexOf("kategori audit") !== -1) {
          return sh;
        }
      }
    }
    if (sheets.length === 1) return sheets[0];
  }

  // Khusus Opname Pallet jika nama tab mengandung kata pallet / palet / opname
  if (norm.indexOf("pallet") > -1 || norm.indexOf("palet") > -1 || norm.indexOf("opname") > -1) {
    for (var k = 0; k < sheets.length; k++) {
      var pNameLow = sheets[k].getName().toLowerCase();
      if (pNameLow.indexOf("pallet") > -1 || pNameLow.indexOf("palet") > -1 || pNameLow.indexOf("opname") > -1) {
        return sheets[k];
      }
    }
    // Deteksi berdasarkan header palet
    for (var ph = 0; ph < sheets.length; ph++) {
      var pSh = sheets[ph];
      if (pSh.getLastRow() >= 1) {
        var phRow = pSh.getRange(1, 1, 1, Math.min(pSh.getLastColumn(), 16)).getValues()[0];
        var phStr = phRow.join(" ").toLowerCase();
        if (phStr.indexOf("palet") !== -1 || phStr.indexOf("pallet") !== -1 || phStr.indexOf("bin") !== -1 || phStr.indexOf("rak") !== -1) {
          return pSh;
        }
      }
    }
  }
  return null;
}

/**
 * Helper untuk menghapus atau mengosongkan baris secara aman di Google Sheet
 */
function safelyDeleteOrClearRow(sheet, rowIdx) {
  if (!sheet || rowIdx < 1) return;
  try {
    if (sheet.getMaxRows() > 1 && sheet.getLastRow() > 1) {
      sheet.deleteRow(rowIdx);
    } else {
      var lc = Math.max(1, sheet.getLastColumn(), 20);
      sheet.getRange(rowIdx, 1, 1, lc).clearContent();
      sheet.getRange(rowIdx, 1, 1, lc).clearFormat();
    }
  } catch (err) {
    try {
      var lc2 = Math.max(1, sheet.getLastColumn(), 20);
      sheet.getRange(rowIdx, 1, 1, lc2).clearContent();
    } catch (e2) {}
  }
}

/**
 * Helper untuk mendeteksi apakah baris adalah header resmi
 */
function isGenericHeaderRow(rowArray) {
  if (!rowArray || !rowArray.length) return false;
  var joined = rowArray.join(" ").toLowerCase();
  return (joined.indexOf("no_palet") > -1 || joined.indexOf("id_permintaan") > -1 || 
          joined.indexOf("id_lot") > -1 || joined.indexOf("id_keluar") > -1 || 
          joined.indexOf("nama warehouse inspektor") > -1 || joined.indexOf("timestamp") > -1);
}

/**
 * Mencari indeks baris (row index, 1-indexed) target pada sheet dengan multi-strategi:
 * 1. Pengecekan rowNumber / rowIndex eksplisit jika dikirimkan oleh aplikasi
 * 2. Pencocokan Ceklist Warehouse cerdas: Timestamp Kolom A, ID, CW-100x indeks, atau Deskripsi Temuan
 * 3. Pencocokan Palet Opname cerdas: Nomor Palet (misal 330), ID (misal PLT-...), BIN / Slot Rak, atau JSON Kolom D
 * 4. Mendukung baris 1 s/d lastRow (bahkan jika baris 1 berisi data tanpa header)
 * 5. Full scan seluruh sel jika belum ditemukan
 */
function findTargetRowInSheet(sheet, params, targetId, keyColName, sheetName) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return -1;

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var allRawData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var allDisplayData = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();

  var expRow = parseInt(params.rowNumber || params.rowIndex || 0, 10);
  var tsSearch = String(params.timestamp || params.waktu || "").trim();
  var targetIdLow = String(targetId || "").trim().toLowerCase();
  var sLowName = String(sheetName || "").toLowerCase();
  var isPalletSheet = (sheetName === SHEET_NAMES.OPNAME_PALLET || sheetName === "STOCK_OPNAME_PALLET_GBB" || 
                       sheetName === "DATA_STOCK_OPNAME_PALLET" || sLowName.indexOf("pallet") > -1 || sLowName.indexOf("palet") > -1);

  var searchNoPalet = String(params.NO_PALET || params.noPalet || params.noPallet || params.nomorPalet || "").trim().toLowerCase();
  var searchBin = String(params.AREA_POSISI_BIN || params.slotRak || params.bin || "").trim().toLowerCase();

  function isGenericHeaderLabel(str) {
    var s = String(str || "").replace(/[\s_()-]/g, '').toLowerCase();
    return (s === 'nopalet' || s === 'nopallet' || s === 'nomorpalet' || s === 'id' || s === 'no' || 
            s === 'areaposisibin' || s === 'slotrak' || s === 'gudang' || s === 'jenispallet' || 
            s === 'statusmuatan' || s === 'kondisifisik' || s === 'kondisikebersihan' || s === 'statuskondisi' ||
            s === 'catatan' || s === 'timestamp' || s === 'tanggalaudit' || s === 'auditorpic' || s === 'pic');
  }

  // STRATEGI 1: Pengecekan rowNumber / rowIndex eksplisit (1 s/d lastRow)
  if (expRow >= 1 && expRow <= lastRow) {
    var rIdx = expRow - 1;
    var rowRaw = allRawData[rIdx];
    var rowDisp = allDisplayData[rIdx];
    var matched = false;

    if (tsSearch && isSameDateOrTimestamp(rowRaw[0], rowDisp[0], tsSearch)) {
      matched = true;
    } else {
      for (var j = 0; j < lastCol; j++) {
        var cDisp = String(rowDisp[j] || "").trim().toLowerCase();
        var cRaw = String(rowRaw[j] || "").trim().toLowerCase();
        if ((targetIdLow && (cDisp === targetIdLow || cRaw === targetIdLow)) ||
            (searchNoPalet && (cDisp === searchNoPalet || cRaw === searchNoPalet)) ||
            (tsSearch && isSameDateOrTimestamp(rowRaw[j], rowDisp[j], tsSearch))) {
          matched = true;
          break;
        }
      }
    }
    if (matched || (targetIdLow && targetIdLow === ("cw-" + (1000 + expRow - 1)))) {
      return expRow;
    }
  }

  // STRATEGI 2: Khusus Sheet Stock Opname Pallet (STOCK_OPNAME_PALLET_GBB)
  if (isPalletSheet || searchNoPalet) {
    // 2.1 Cek apakah tersimpan di dalam teks JSON Kolom D / batchData
    for (var rJ = 0; rJ < allRawData.length; rJ++) {
      for (var cJ = 0; cJ < lastCol; cJ++) {
        var rawVal = String(allRawData[rJ][cJ] || "");
        var dispVal = String(allDisplayData[rJ][cJ] || "");
        var cellStr = (rawVal.length >= dispVal.length ? rawVal : dispVal).trim();
        if (cellStr.indexOf("[") > -1 || cellStr.indexOf("{") > -1) {
          var matchTarget = (targetIdLow && cellStr.toLowerCase().indexOf(targetIdLow) > -1) || 
                             (searchNoPalet && cellStr.toLowerCase().indexOf(searchNoPalet) > -1);
          if (matchTarget) {
            try {
              var pJson = JSON.parse(cellStr);
              if (Array.isArray(pJson)) {
                if (pJson.length <= 1) {
                  return rJ + 1; // Hapus seluruh baris
                } else {
                  // Saring keluar item yang dihapus dan simpan kembali selnya
                  var filteredJson = pJson.filter(function(item) {
                    var iId = String(item.id || item.ID || "").trim().toLowerCase();
                    var iNo = String(item.noPalet || item.noPallet || item.NO_PALET || "").trim().toLowerCase();
                    return (targetIdLow && iId === targetIdLow) ? false : ((searchNoPalet && iNo === searchNoPalet) ? false : true);
                  });
                  sheet.getRange(rJ + 1, cJ + 1).setValue(JSON.stringify(filteredJson));
                  return -999; // Penanda sukses hapus di dalam array JSON
                }
              }
            } catch (je) {}
            return rJ + 1;
          }
        }
      }
    }

    // 2.2 Pencocokan nomor palet atau ID di baris mana saja (termasuk baris 1 jika data ada di baris 1)
    for (var rP = 0; rP < allRawData.length; rP++) {
      // Jika baris 1 adalah header resmi dan ada baris lain, lewati
      if (rP === 0 && lastRow > 1 && isGenericHeaderRow(allDisplayData[0])) {
        continue;
      }

      for (var cP = 0; cP < lastCol; cP++) {
        var vDisp = String(allDisplayData[rP][cP] || "").trim().toLowerCase();
        var vRaw = String(allRawData[rP][cP] || "").trim().toLowerCase();

        if (rP === 0 && isGenericHeaderLabel(vDisp)) {
          continue;
        }

        var matchP = false;
        if (searchNoPalet && (vDisp === searchNoPalet || vRaw === searchNoPalet)) {
          matchP = true;
        } else if (targetIdLow && (vDisp === targetIdLow || vRaw === targetIdLow)) {
          matchP = true;
        }

        if (matchP) {
          // Jika searchBin ada, verifikasi baris ini juga cocok jika ada
          if (searchBin) {
            var rowText = allDisplayData[rP].join(" ").toLowerCase();
            if (rowText.indexOf(searchBin) > -1) {
              return rP + 1;
            }
          }
          return rP + 1;
        }
      }
    }
  }

  // STRATEGI 3: Sheet Ceklist Warehouse / Form Responses
  if (sheetName === SHEET_NAMES.CEKLIST || sheetName === "DATA_CEKLIST_WAREHOUSE" || 
      sLowName.indexOf("ceklist") > -1 || sLowName.indexOf("checklist") > -1 ||
      sLowName.indexOf("formulir") > -1 || sLowName.indexOf("response") > -1) {
    var effectiveTs = tsSearch || targetId;
    for (var rTs = 0; rTs < allRawData.length; rTs++) {
      if (isSameDateOrTimestamp(allRawData[rTs][0], allDisplayData[rTs][0], effectiveTs)) {
        return rTs + 1;
      }
    }

    var cwMatch = targetIdLow.match(/^cw-1(\d+)$/i);
    if (cwMatch) {
      var numPart = parseInt(cwMatch[1], 10);
      var guessedRow = numPart + 1;
      if (guessedRow >= 1 && guessedRow <= lastRow) {
        return guessedRow;
      }
    }

    var deskSearch = String(params.deskripsi || params.diskripsi || "").trim().toLowerCase();
    if (deskSearch && deskSearch.length > 5) {
      for (var rD = 0; rD < allRawData.length; rD++) {
        for (var cD = 0; cD < lastCol; cD++) {
          var curDesk = String(allDisplayData[rD][cD] || allRawData[rD][cD] || "").trim().toLowerCase();
          if (curDesk.indexOf(deskSearch.slice(0, 20)) > -1) {
            return rD + 1;
          }
        }
      }
    }
  }

  // STRATEGI 4: Full scan seluruh sel (dari baris 1 s/d lastRow)
  for (var rFull = 0; rFull < allRawData.length; rFull++) {
    if (rFull === 0 && lastRow > 1 && isGenericHeaderRow(allDisplayData[0])) {
      continue;
    }

    for (var cFull = 0; cFull < lastCol; cFull++) {
      var dVal = String(allDisplayData[rFull][cFull] || "").trim().toLowerCase();
      var rVal = String(allRawData[rFull][cFull] || "").trim().toLowerCase();
      
      if (rFull === 0 && isGenericHeaderLabel(dVal)) {
        continue;
      }

      if (targetIdLow && (dVal === targetIdLow || rVal === targetIdLow)) {
        return rFull + 1;
      }
      if (searchNoPalet && (dVal === searchNoPalet || rVal === searchNoPalet)) {
        return rFull + 1;
      }
      if (tsSearch && isSameDateOrTimestamp(allRawData[rFull][cFull], allDisplayData[rFull][cFull], tsSearch)) {
        return rFull + 1;
      }
    }
  }

  return -1;
}

/**
 * Mencari nilai parameter dengan pencocokan nama kolom fleksibel & alias (anti beda spasi/huruf besar-kecil)
 */
function findParamValue(params, name) {
  if (!params) return undefined;
  if (params.hasOwnProperty(name)) return params[name];
  var target = String(name).replace(/[\s_()-]/g, '').toLowerCase();
  for (var k in params) {
    if (String(k).replace(/[\s_()-]/g, '').toLowerCase() === target) {
      return params[k];
    }
  }

  // Alias dictionary cerdas untuk seluruh kolom
  var aliases = {
    "status": ["status", "status_penyelesaian", "status_temuan"],
    "tindakanperbaikan": ["tindakan", "tindakan_perbaikan", "tindakanperbaikan", "keterangan_selesai", "perbaikan", "action"],
    "dokumentasifoto2": ["foto2", "foto_2", "fotoafter", "foto_after", "dokumentasifoto2", "dokumentasi_foto_2", "dokumentasifotoafter", "afterphoto"],
    "dokumentasifoto1": ["foto1", "foto_1", "fotobefore", "foto_before", "dokumentasifoto1", "dokumentasi_foto_1", "beforephoto"],
    "diskripsitemuan": ["deskripsi", "diskripsi", "deskripsi_temuan", "diskripsi_temuan", "temuan"],
    "namawarehouseinspektor": ["petugas", "inspektor", "nama_inspektor", "nama"],
    "nomorgudang": ["nomorgudang", "nomor_gudang", "no_gudang", "gudang"],
    "tanggalinspeksi": ["tanggal", "tgl", "tanggal_inspeksi", "tgl_inspeksi"],
    "targetselesai": ["target", "target_selesai", "targetselesai"],
    "tingkatkeparahan": ["keparahan", "tingkat_keparahan", "severity"],
    "kategoriaudit": ["kategori", "kategori_audit", "audit"],
    "pic": ["pic", "auditor_pic", "auditor", "auditorpic", "penanggung_jawab", "petugas", "pemeriksa", "checker", "pic_gudang", "picgudang", "nama"],
    "auditorpic": ["auditor_pic", "auditorpic", "pic", "auditor", "penanggung_jawab", "petugas"],
    "auditor": ["auditor", "auditor_pic", "auditorpic", "pic", "penanggung_jawab", "petugas"],
    "dokumentasi": ["dokumentasi", "bukti_foto", "foto", "foto_bukti", "buktifoto", "image", "photo", "fotopallet", "dokumentasifoto", "fotobukti"],
    "buktifoto": ["bukti_foto", "buktifoto", "dokumentasi", "foto", "foto_bukti", "image", "photo", "fotopallet", "fotobukti"],
    "foto": ["foto", "bukti_foto", "buktifoto", "dokumentasi", "foto_bukti", "image", "photo"],
    "resumetanggal": ["resumetanggal", "resume_tanggal", "timestamp", "timestamp_proses", "waktu", "tgl_audit", "tglaudit", "tanggal_stock_opname", "tanggalstockopname", "tanggal", "tgl"],
    "resumetgl": ["resumetanggal", "resume_tanggal", "timestamp", "timestamp_proses", "waktu", "tgl_audit", "tanggal_stock_opname", "tanggal", "tgl"],
    "tanggalstockopname": ["tanggal_stock_opname", "tanggalstockopname", "resumetanggal", "resume_tanggal", "tgl_audit", "tglaudit", "tanggal", "tgl", "timestamp"],
    "tglaudit": ["tgl_audit", "tglaudit", "tanggal_stock_opname", "tanggalstockopname", "resumetanggal", "resume_tanggal", "tanggal", "tgl"],
    "timestamp": ["timestamp", "resumetanggal", "resume_tanggal", "waktu", "tgl_audit", "tglaudit", "tanggal_stock_opname"],
    "nopalet": ["no_palet", "nopalet", "no_pallet", "nopallet", "nomor_palet", "nomorpalet", "nomor_pallet", "nomorpallet"],
    "nopallet": ["no_pallet", "nopallet", "no_palet", "nopalet", "nomor_pallet", "nomorpallet"],
    "areaposisibin": ["area_posisi_bin", "areaposisibin", "slot_rak", "slotrak", "bin", "area", "lokasi", "posisi"],
    "slotrak": ["slot_rak", "slotrak", "area_posisi_bin", "areaposisibin", "bin", "area", "lokasi", "posisi"],
    "statusmuatan": ["status_muatan", "statusmuatan", "muatan"],
    "kondisifisik": ["kondisi_fisik", "kondisifisik", "fisik", "kondisi"],
    "kondisikebersihan": ["kondisi_kebersihan", "kondisikebersihan", "kebersihan"],
    "statuskondisi": ["status_kondisi", "statuskondisi", "kondisi", "status"],
    "bagian": ["bagian", "divisi"],
    "area": ["area", "lokasi"]
  };

  if (aliases[target]) {
    for (var i = 0; i < aliases[target].length; i++) {
      var aliasKey = aliases[target][i];
      for (var pk in params) {
        if (String(pk).replace(/[\s_()-]/g, '').toLowerCase() === aliasKey) {
          return params[pk];
        }
      }
    }
  }

  return undefined;
}

/**
 * Helper untuk decode Base64 data image dan simpan ke folder Google Drive
 * Mengembalikan Link File Google Drive yang dapat diakses (Public View)
 */
function saveBase64ToDriveFolder(val, folderName, filePrefix) {
  if (!val || typeof val !== 'string') return "";
  var strVal = String(val).trim();
  if (strVal.indexOf('data:image/') !== 0) {
    // Sudah berupa Link URL atau teks biasa
    return strVal;
  }

  try {
    var fName = folderName || "SIBIKOM_FOTO_PALLET";
    var prefix = filePrefix || "Foto_Pallet_";
    var commaIdx = strVal.indexOf(',');
    if (commaIdx === -1) return "";

    var headerPart = strVal.substring(0, commaIdx);
    var base64Data = strVal.substring(commaIdx + 1);

    var contentType = 'image/jpeg';
    if (headerPart.indexOf('image/png') > -1) contentType = 'image/png';
    else if (headerPart.indexOf('image/webp') > -1) contentType = 'image/webp';

    var decoded = Utilities.base64Decode(base64Data);
    var timeStamp = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd_HHmmss");
    var ext = (contentType === 'image/png') ? '.png' : (contentType === 'image/webp' ? '.webp' : '.jpg');
    var fileName = prefix + timeStamp + ext;
    var blob = Utilities.newBlob(decoded, contentType, fileName);

    var folders = DriveApp.getFoldersByName(fName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(fName);
    var file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      Logger.log("Peringatan izin sharing: " + shareErr.toString());
    }

    return file.getUrl();
  } catch (driveErr) {
    Logger.log("Gagal simpan foto base64 ke Google Drive: " + driveErr.toString());
    if (strVal.length < 500) return strVal;
    return "Foto Dokumentasi (" + (filePrefix || "Pallet") + ")";
  }
}

/**
 * Format nilai sebelum disimpan ke Google Sheet
 */
function formatValueForSheet(colName, val) {
  if (val === null || val === undefined) return "";
  var colUpper = String(colName).toUpperCase();

  // Kolom Foto Base64 (Upload dari kamera/file browser)
  if (typeof val === 'string' && val.indexOf('data:image/') === 0) {
    var isPallet = colUpper.indexOf("PALLET") > -1 || colUpper.indexOf("PLT") > -1 || colUpper.indexOf("DOKUMENTASI") > -1 || colUpper.indexOf("BUKTI") > -1 || colUpper.indexOf("FOTO") > -1;
    var fName = isPallet ? "SIBIKOM_FOTO_PALLET" : "SIBIKOM_FOTO_CEKLIST";
    var prefix = isPallet ? "Foto_Pallet_" : "Foto_Ceklist_";
    return saveBase64ToDriveFolder(val, fName, prefix);
  }

  // Kolom Angka / Qty / Berat
  if (colUpper.indexOf("QTY") > -1 || colUpper.indexOf("KG") > -1 || colUpper.indexOf("BERAT") > -1 ||
      colUpper.indexOf("JUMLAH") > -1 || colUpper.indexOf("KARUNG") > -1 || colUpper.indexOf("NETTO") > -1 ||
      colUpper.indexOf("BRUTO") > -1 || colUpper.indexOf("REALISASI") > -1 || colUpper.indexOf("SISA") > -1) {
    return parseNumberSafe(val);
  }

  // Kolom Persentase
  if (colUpper.indexOf("PERSEN") > -1 || colUpper.indexOf("%") > -1) {
    var pNum = parseNumberSafe(val);
    if (pNum > 1) pNum = pNum / 100;
    return pNum;
  }

  return val;
}

/**
 * Membaca seluruh data baris pada sheet menjadi Array of Objects
 */
function readSheetDataAsJSON(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var displayHeaders = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];

  // Jika sheet hanya memiliki 1 baris, periksa apakah baris 1 adalah data (bukan header resmi)
  if (lastRow === 1) {
    if (!isGenericHeaderRow(displayHeaders)) {
      var singleRowObj = { _rowNumber: 1, _raw: displayHeaders };
      for (var sc = 0; sc < lastCol; sc++) {
        var sVal = displayHeaders[sc];
        singleRowObj["col_" + (sc + 1)] = sVal;
        var sValTrim = String(sVal || "").trim();
        if (sValTrim.toLowerCase() === "pallet kayu" || sValTrim.toLowerCase() === "pallet plastik") singleRowObj["JENIS_PALLET"] = sValTrim;
        else if (sValTrim === "TIDAK_RUSAK" || sValTrim === "RUSAK") singleRowObj["KONDISI_FISIK"] = sValTrim;
        else if (sValTrim === "KOSONG" || sValTrim === "TERISI") singleRowObj["STATUS_MUATAN"] = sValTrim;
        else if (sValTrim === "BAIK" || sValTrim === "PERBAIKAN" || sValTrim === "AFVAL") singleRowObj["STATUS_KONDISI"] = sValTrim;
        else if (sValTrim.indexOf("OUTSIDE") > -1 || sValTrim.indexOf("BIN") > -1 || sValTrim.indexOf("RAK") > -1) singleRowObj["AREA_POSISI_BIN"] = sValTrim;
        else if (sValTrim.indexOf("Gudang") > -1) singleRowObj["GUDANG"] = sValTrim;
        else if (sValTrim.indexOf("PLT-") === 0) singleRowObj["ID"] = sValTrim;
        else if (/^\d{1,5}$/.test(sValTrim)) singleRowObj["NO_PALET"] = sValTrim;
        else if (/^\d{4}-\d{2}-\d{2}/.test(sValTrim)) singleRowObj["TANGGAL_STOCK_OPNAME"] = sValTrim;
      }
      return [singleRowObj];
    }
    return [];
  }

  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var displayValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
  var result = [];

  for (var r = 0; r < values.length; r++) {
    var rowObj = { _rowNumber: r + 2, _raw: displayValues[r] };
    var hasValue = false;
    for (var c = 0; c < headers.length; c++) {
      var hName = String(headers[c] || ("Kolom_" + (c + 1))).trim();
      var cellVal = values[r][c];
      var dispVal = displayValues[r][c];

      if (cellVal !== "" && cellVal !== null && cellVal !== undefined) {
        hasValue = true;
      }
      
      // Jika cell berupa Date, utamakan tampilan displayValue atau format string
      if (cellVal instanceof Date) {
        rowObj[hName] = dispVal || Utilities.formatDate(cellVal, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
      } else {
        rowObj[hName] = cellVal;
      }
    }
    if (hasValue) {
      result.push(rowObj);
    }
  }

  return result;
}

/**
 * Setup Header Sheet Ceklist Otomatis jika sheet belum ada
 */
function setupCeklistSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.CEKLIST);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.CEKLIST);
  }

  if (sheet.getLastRow() === 0) {
    var headers = [
      "Timestamp", "Nama Warehouse Inspektor", "Tanggal Inspeksi", "Bagian",
      "Area", "Nomor gudang", "Kategori Audit", "Tingkat Keparahan",
      "Dokumentasi foto 1", "Dokumentasi foto 2", "Diskripsi Temuan",
      "Tindakan Perbaikan", "PIC", "Target Selesai", "Status", "Email Address"
    ];
    sheet.appendRow(headers);
    var hRange = sheet.getRange(1, 1, 1, headers.length);
    hRange.setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Otomatis inisialisasi sheet INPUT_OPER_GUDANG beserta header
 */
function setupOperGudangSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.OPER);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.OPER);
  }

  if (sheet.getLastRow() === 0) {
    var headers = [
      "TANGGAL_OPER", "JAM_OPER", "SHIFT_OPER", "ID_OPER", 
      "GUDANG_ASAL", "GUDANG_TUJUAN", "ID_LOT", "JENIS_KOPI", 
      "NO_PALET", "LOKASI_TUJUAN", "KARUNG_OPER", "KG_OPER", 
      "NO_KENDARAAN", "DRIVER", "KETERANGAN", "TIMESTAMP"
    ];
    sheet.appendRow(headers);
    var hRange = sheet.getRange(1, 1, 1, headers.length);
    hRange.setBackground("#4338ca").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Otomatis inisialisasi sheet STOCK_OPNAME_PALLET_GBB beserta header
 */
function setupOpnamePalletSheet(ss) {
  var targetSs = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = targetSs.getSheetByName("STOCK_OPNAME_PALLET_GBB") || targetSs.getSheetByName(SHEET_NAMES.OPNAME_PALLET);
  if (!sheet) {
    sheet = targetSs.insertSheet("STOCK_OPNAME_PALLET_GBB");
  }

  if (sheet.getLastRow() === 0) {
    var headers = [
      "ID", "TANGGAL_STOCK_OPNAME", "NO_PALET", "AREA_POSISI_BIN", "GUDANG",
      "JENIS_PALLET", "STATUS_MUATAN", "KONDISI_FISIK", "KONDISI_KEBERSIHAN",
      "STATUS_KONDISI", "CATATAN", "Dokumentasi", "PIC", "Resume Tanggal"
    ];
    sheet.appendRow(headers);
    var hRange = sheet.getRange(1, 1, 1, headers.length);
    hRange.setBackground("#065f46").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Menu Kustom di Google Sheets
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("⚡ SIBIKOM System")
    .addItem("📸 Sinkronkan Kolom L (Foto), M (PIC), & N (Tanggal)", "syncMissingPalletColumnsMenu")
    .addItem("🖼️ Konversi Base64 Foto Pallet ke Link Drive (Kolom L)", "convertExistingPalletBase64ToLinksMenu")
    .addItem("🔨 Pecah / Breakdown Kolom D (JSON Palet -> Tabel Rapi)", "breakdownKolomDPalletMenu")
    .addSeparator()
    .addItem("📦 Inisialisasi Sheet STOCK_OPNAME_PALLET_GBB", "setupOpnamePalletSheet")
    .addItem("🔍 Inisialisasi Sheet Ceklist", "setupCeklistSheet")
    .addItem("🔄 Inisialisasi Sheet Oper Gudang", "setupOperGudangSheet")
    .addItem("🧪 Tes Status Koneksi", "testConnectionMenu")
    .addToUi();
}

function testConnectionMenu() {
  SpreadsheetApp.getUi().alert("Google Apps Script SIBIKOM telah aktif dan siap melayani permintaan Web App!");
}

/**
 * =========================================================================
 * FUNGSI SINKRONISASI LENGKAP KOLOM L (DOKUMENTASI), M (PIC), & N (RESUME TANGGAL)
 * =========================================================================
 * Memastikan data Dokumentasi (Link Drive), PIC Auditor, dan Tanggal Resume
 * terisi lengkap dan tidak ada yang kosong pada sheet STOCK_OPNAME_PALLET_GBB.
 */
function syncMissingPalletColumnsMenu() {
  try {
    var res = syncAndFillPalletColumns();
    SpreadsheetApp.getUi().alert(
      "✅ Berhasil Sinkronkan Kolom L, M, & N!\n\n" +
      "• Total Baris Diperiksa   : " + res.totalRows + " baris\n" +
      "• Baris Terisi/Diperbarui : " + res.updatedRows + " baris\n" +
      "• Foto Dikonversi ke Link : " + res.convertedPhotos + " unit\n" +
      "• Sheet                   : " + res.sheetName + "\n\n" +
      "Kolom Dokumentasi (L), PIC (M), dan Resume Tanggal (N) kini telah terisi dengan data yang rapi dan siap dilaporkan."
    );
  } catch (err) {
    SpreadsheetApp.getUi().alert("❌ Gagal Sinkronkan Kolom: " + err.message);
  }
}

function syncAndFillPalletColumns(ssObj, targetSheetName, optPayload) {
  var ss = ssObj || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSheetByNameCaseInsensitive(ss, targetSheetName || "STOCK_OPNAME_PALLET_GBB") ||
              getSheetByNameCaseInsensitive(ss, SHEET_NAMES.OPNAME_PALLET);

  if (!sheet) {
    throw new Error("Sheet 'STOCK_OPNAME_PALLET_GBB' tidak ditemukan!");
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return {
      status: "success",
      sheetName: sheet.getName(),
      totalRows: 0,
      updatedRows: 0,
      convertedPhotos: 0,
      message: "Sheet masih kosong atau hanya berisi header."
    };
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colDokumentasi = -1;
  var colPic = -1;
  var colResume = -1;
  var colNoPalet = -1;
  var colTanggal = -1;

  for (var c = 0; c < headers.length; c++) {
    var hNorm = String(headers[c] || "").replace(/[\s_()-]/g, '').toLowerCase();
    if (hNorm === "dokumentasi" || hNorm === "buktifoto" || hNorm === "foto") colDokumentasi = c + 1;
    else if (hNorm === "pic" || hNorm === "auditor" || hNorm === "auditorpic") colPic = c + 1;
    else if (hNorm === "resumetanggal" || hNorm === "timestamp") colResume = c + 1;
    else if (hNorm === "nopalet" || hNorm === "nopallet") colNoPalet = c + 1;
    else if (hNorm === "tanggalstockopname" || hNorm === "tglaudit" || hNorm === "tanggal") colTanggal = c + 1;
  }

  // Fallback ke posisi standar (L=12, M=13, N=14, C=3, B=2)
  if (colDokumentasi === -1 && lastCol >= 12) colDokumentasi = 12;
  if (colPic === -1 && lastCol >= 13) colPic = 13;
  if (colResume === -1 && lastCol >= 14) colResume = 14;
  if (colNoPalet === -1 && lastCol >= 3) colNoPalet = 3;
  if (colTanggal === -1 && lastCol >= 2) colTanggal = 2;

  var updatedCount = 0;
  var convertedPhotos = 0;

  var p = optPayload || {};
  var defaultAuditor = p.auditor || p.AUDITOR_PIC || p.pic || "Nadia";

  // Baca seluruh data baris (mulai baris 2)
  for (var rIdx = 2; rIdx <= lastRow; rIdx++) {
    var rowVals = sheet.getRange(rIdx, 1, 1, Math.max(lastCol, 14)).getValues()[0];
    var rowChanged = false;

    var noPlt = colNoPalet > 0 ? String(rowVals[colNoPalet - 1] || "").trim() : "";
    var tglRow = colTanggal > 0 ? String(rowVals[colTanggal - 1] || "").trim() : "";
    if (tglRow && tglRow.indexOf("T") > -1) tglRow = tglRow.split("T")[0];

    // 1. Periksa Kolom Dokumentasi (L)
    if (colDokumentasi > 0) {
      var valDok = String(rowVals[colDokumentasi - 1] || "").trim();
      if (valDok.indexOf("data:image/") === 0) {
        var prefix = "Foto_Pallet_" + (noPlt || ("Row" + rIdx)) + "_";
        var driveLink = saveBase64ToDriveFolder(valDok, "SIBIKOM_FOTO_PALLET", prefix);
        sheet.getRange(rIdx, colDokumentasi).setValue(driveLink);
        convertedPhotos++;
        rowChanged = true;
      } else if (!valDok && p.foto && (!p.noPalet || p.noPalet === noPlt)) {
        var prefix2 = "Foto_Pallet_" + (noPlt || ("Row" + rIdx)) + "_";
        var driveLink2 = saveBase64ToDriveFolder(p.foto, "SIBIKOM_FOTO_PALLET", prefix2);
        sheet.getRange(rIdx, colDokumentasi).setValue(driveLink2);
        convertedPhotos++;
        rowChanged = true;
      }
    }

    // 2. Periksa Kolom PIC (M)
    if (colPic > 0) {
      var valPic = String(rowVals[colPic - 1] || "").trim();
      if (!valPic) {
        sheet.getRange(rIdx, colPic).setValue(defaultAuditor);
        rowChanged = true;
      }
    }

    // 3. Periksa Kolom Resume Tanggal (N)
    if (colResume > 0) {
      var valResume = String(rowVals[colResume - 1] || "").trim();
      if (!valResume) {
        var resumeDate = tglRow || p.tglAudit || Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
        sheet.getRange(rIdx, colResume).setValue(resumeDate);
        rowChanged = true;
      }
    }

    if (rowChanged) updatedCount++;
  }

  return {
    status: "success",
    sheetName: sheet.getName(),
    totalRows: lastRow - 1,
    updatedRows: updatedCount,
    convertedPhotos: convertedPhotos,
    message: "Berhasil memperbarui Kolom L (Foto), M (PIC), dan N (Resume Tanggal) pada " + updatedCount + " baris data!"
  };
}

/**
 * =========================================================================
 * FUNGSI KONVERSI FOTO BASE64 KE LINK GOOGLE DRIVE (KOLOM L DOKUMENTASI)
 * =========================================================================
 * Mengonversi seluruh teks foto base64 mentah ("data:image/jpeg;base64,...")
 * yang ada di Kolom L (Dokumentasi/BUKTI_FOTO) sheet STOCK_OPNAME_PALLET_GBB
 * menjadi Link Google Drive yang dapat diakses publik.
 */
function convertExistingPalletBase64ToLinksMenu() {
  try {
    var res = convertExistingPalletBase64ToLinks();
    if (res.convertedCount > 0) {
      SpreadsheetApp.getUi().alert(
        "✅ Berhasil Mengonversi Foto ke Link Google Drive!\n\n" +
        "• Total Foto Dikonversi : " + res.convertedCount + " unit\n" +
        "• Kolom Target          : Kolom " + res.columnLetter + " (" + res.columnName + ")\n" +
        "• Sheet                 : " + res.sheetName + "\n" +
        "• Folder Google Drive   : " + res.folderName + "\n\n" +
        "Seluruh foto base64 yang panjang telah berhasil diunggah ke Google Drive dan diganti menjadi link akses langsung yang rapi dan mudah dibuka."
      );
    } else {
      SpreadsheetApp.getUi().alert(
        "ℹ️ Informasi Konversi Foto:\n\n" +
        "Tidak ditemukan teks foto base64 baru pada Kolom L sheet " + res.sheetName + ".\n" +
        "Seluruh foto sudah berupa Link Google Drive atau sel tidak berisi foto."
      );
    }
  } catch (err) {
    SpreadsheetApp.getUi().alert("❌ Gagal Mengonversi Foto: " + err.message);
  }
}

function convertExistingPalletBase64ToLinks(ssObj, targetSheetName) {
  var ss = ssObj || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSheetByNameCaseInsensitive(ss, targetSheetName || "STOCK_OPNAME_PALLET_GBB") ||
              getSheetByNameCaseInsensitive(ss, SHEET_NAMES.OPNAME_PALLET);

  if (!sheet) {
    throw new Error("Sheet 'STOCK_OPNAME_PALLET_GBB' tidak ditemukan!");
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    return {
      status: "success",
      sheetName: sheet.getName(),
      convertedCount: 0,
      message: "Sheet masih kosong."
    };
  }

  // 1. Tentukan kolom foto (Dokumentasi / BUKTI_FOTO / Kolom L = 12)
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIdx = -1;
  var colName = "";

  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || "").trim().toUpperCase();
    if (h === "DOKUMENTASI" || h === "BUKTI_FOTO" || h === "FOTO" || h === "FOTO_DOKUMENTASI" || h === "GAMBAR") {
      colIdx = c + 1;
      colName = String(headers[c]);
      break;
    }
  }

  // Jika tidak ditemukan dari nama header, cek apakah kolom 12 (Kolom L) memiliki base64 atau header
  if (colIdx === -1 && lastCol >= 12) {
    colIdx = 12;
    colName = String(headers[11] || "Dokumentasi (Kolom L)");
  }

  // Jika masih belum, scan semua kolom untuk mencari sel yang berisi "data:image/"
  if (colIdx === -1) {
    var sampleRows = sheet.getRange(1, 1, Math.min(lastRow, 25), lastCol).getValues();
    for (var sc = 0; sc < lastCol; sc++) {
      for (var sr = 0; sr < sampleRows.length; sr++) {
        var sVal = String(sampleRows[sr][sc] || "");
        if (sVal.indexOf("data:image/") === 0) {
          colIdx = sc + 1;
          colName = String(headers[sc] || ("Kolom " + String.fromCharCode(65 + sc)));
          break;
        }
      }
      if (colIdx !== -1) break;
    }
  }

  if (colIdx === -1) {
    colIdx = 12; // Fallback Kolom L
    colName = "Dokumentasi";
  }

  var colLetter = String.fromCharCode(64 + colIdx);
  var convertedCount = 0;

  // 2. Baca seluruh nilai di kolom target
  var range = sheet.getRange(1, colIdx, lastRow, 1);
  var values = range.getValues();

  // Ambil data No Palet (biasanya di kolom 3 / C) untuk penamaan file yang rapi
  var noPaletValues = [];
  if (lastCol >= 3) {
    noPaletValues = sheet.getRange(1, 3, lastRow, 1).getValues();
  }

  var updatedValues = [];
  var needsUpdate = false;

  for (var r = 0; r < values.length; r++) {
    var cellVal = values[r][0];
    var strVal = String(cellVal || "").trim();

    if (strVal.indexOf("data:image/") === 0) {
      var noPlt = "";
      if (noPaletValues.length > r) {
        noPlt = String(noPaletValues[r][0] || "").trim();
      }
      var prefix = "Foto_Pallet_" + (noPlt ? (noPlt + "_") : ("Row" + (r + 1) + "_"));
      var driveUrl = saveBase64ToDriveFolder(strVal, "SIBIKOM_FOTO_PALLET", prefix);
      updatedValues.push([driveUrl]);
      convertedCount++;
      needsUpdate = true;
    } else {
      updatedValues.push([cellVal]);
    }
  }

  if (needsUpdate && updatedValues.length > 0) {
    range.setValues(updatedValues);
  }

  return {
    status: "success",
    sheetName: sheet.getName(),
    convertedCount: convertedCount,
    totalRows: lastRow,
    columnLetter: colLetter,
    columnName: colName,
    folderName: "SIBIKOM_FOTO_PALLET",
    message: "Berhasil mengonversi " + convertedCount + " foto base64 di Kolom " + colLetter + " menjadi Link Google Drive!"
  };
}

/**
 * =========================================================================
 * FUNGSI BREAKDOWN DATA KOLOM D (JSON PALET KE TABEL RAPI)
 * =========================================================================
 * Memecah data string JSON pada Kolom D (atau kolom JSON lainnya) menjadi
 * baris-baris data individual yang rapi dan terstruktur (1 Palet = 1 Baris).
 * 
 * Penggunaan:
 * 1. Di Google Sheets: Klik menu '⚡ SIBIKOM System' -> '🔨 Pecah / Breakdown Kolom D'
 * 2. Atau ketik rumus di sel: =BREAKDOWN_PALLET(D2, "noPallet")
 * 3. Atau rumus 1 baris penuh: =BREAKDOWN_PALLET_ROW(D2)
 */

function breakdownKolomDPalletMenu() {
  try {
    var res = breakdownKolomDPallet();
    SpreadsheetApp.getUi().alert(
      "✅ Berhasil Memecah Data Kolom D!\n\n" +
      "• Total Data Palet : " + res.totalPallet + " unit\n" +
      "• Sheet Sumber      : " + res.sourceSheet + " (Kolom " + res.sourceColumn + ")\n" +
      "• Sheet Hasil Rapi  : " + res.targetSheet + "\n\n" +
      "Silakan buka tab sheet '" + res.targetSheet + "' di bagian bawah Spreadsheet Anda untuk melihat data yang sudah tertata rapi dalam 15 kolom terstruktur."
    );
  } catch (err) {
    SpreadsheetApp.getUi().alert("❌ Gagal Memecah Data Kolom D: " + err.message);
  }
}

function breakdownKolomDPallet(ssObj, sourceSheetName, colIdx) {
  var ss = ssObj || SpreadsheetApp.getActiveSpreadsheet();
  var srcSheet;
  if (sourceSheetName) {
    srcSheet = getSheetByNameCaseInsensitive(ss, sourceSheetName);
  }
  if (!srcSheet) {
    srcSheet = ss.getActiveSheet();
  }
  if (!srcSheet) {
    srcSheet = ss.getSheetByName("STOCK_OPNAME_PALLET_GBB") || ss.getSheetByName(SHEET_NAMES.OPNAME_PALLET);
  }
  if (!srcSheet) {
    throw new Error("Sheet sumber tidak ditemukan.");
  }

  var lastRow = srcSheet.getLastRow();
  var lastCol = srcSheet.getLastColumn();
  if (lastRow < 1) {
    throw new Error("Sheet masih kosong, tidak ada data untuk di-breakdown.");
  }

  var cIndex = (colIdx && colIdx > 0) ? colIdx : 4; // Default Kolom D = 4

  // Auto-detect kolom yang berisi teks JSON palet jika kolom D bukan JSON
  var sampleValues = srcSheet.getRange(1, 1, Math.min(lastRow, 10), lastCol).getValues();
  var foundCol = -1;

  if (lastCol >= 4) {
    for (var r = 0; r < sampleValues.length; r++) {
      var val = String(sampleValues[r][3] || "");
      if (val.indexOf("[") > -1 && (val.indexOf("noPalet") > -1 || val.indexOf("noPallet") > -1 || val.indexOf("slotRak") > -1 || val.indexOf("PLT-") > -1)) {
        foundCol = 4;
        break;
      }
    }
  }

  if (foundCol === -1) {
    for (var c = 0; c < lastCol; c++) {
      for (var r2 = 0; r2 < sampleValues.length; r2++) {
        var v = String(sampleValues[r2][c] || "");
        if (v.indexOf("[") > -1 && (v.indexOf("noPalet") > -1 || v.indexOf("noPallet") > -1 || v.indexOf("slotRak") > -1 || v.indexOf("PLT-") > -1)) {
          foundCol = c + 1;
          break;
        }
      }
      if (foundCol !== -1) break;
    }
  }

  if (foundCol !== -1) {
    cIndex = foundCol;
  }

  var colValues = srcSheet.getRange(1, cIndex, lastRow, 1).getValues();
  var parsedItems = [];

  for (var i = 0; i < colValues.length; i++) {
    var rawText = String(colValues[i][0] || "").trim();
    if (!rawText || (rawText.indexOf("[") === -1 && rawText.indexOf("{") === -1)) {
      continue;
    }

    try {
      var parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        for (var j = 0; j < parsed.length; j++) {
          if (parsed[j] && typeof parsed[j] === "object") {
            parsedItems.push(parsed[j]);
          }
        }
      } else if (parsed && typeof parsed === "object") {
        parsedItems.push(parsed);
      }
    } catch (parseErr) {
      // Regex parsing jika string terpotong
      var objectMatches = rawText.match(/\{[^{}]+\}/g);
      if (objectMatches) {
        for (var m = 0; m < objectMatches.length; m++) {
          try {
            var obj = JSON.parse(objectMatches[m]);
            if (obj && (obj.noPallet || obj.noPalet || obj.id)) {
              parsedItems.push(obj);
            }
          } catch (e2) {}
        }
      }
    }
  }

  if (parsedItems.length === 0) {
    throw new Error("Tidak ditemukan teks format JSON palet yang dapat diurai pada kolom " + String.fromCharCode(64 + cIndex) + ".");
  }

  // Siapkan Sheet Tujuan 'STOCK_OPNAME_PALLET_RAPI'
  var targetSheetName = "STOCK_OPNAME_PALLET_RAPI";
  var outSheet = ss.getSheetByName(targetSheetName);
  if (!outSheet) {
    outSheet = ss.insertSheet(targetSheetName);
  } else {
    outSheet.clear();
  }

  var headers = [
    "NO", "ID_PALLET", "TANGGAL_AUDIT", "NO_PALET", "AREA_POSISI_BIN", "GUDANG",
    "JENIS_PALLET", "STATUS_MUATAN", "KONDISI_FISIK", "KONDISI_KEBERSIHAN",
    "STATUS_KONDISI", "CATATAN", "BUKTI_FOTO", "AUDITOR_PIC", "TIMESTAMP_PROSES"
  ];

  outSheet.appendRow(headers);

  var nowStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss") + " WIB";
  var rowsData = [];

  for (var k = 0; k < parsedItems.length; k++) {
    var item = parsedItems[k];
    var noUrut = k + 1;
    var pId = item.id || item.ID || ("PLT-" + (Date.now() + k));
    var pTgl = item.tglAudit || item.TANGGAL_STOCK_OPNAME || Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
    var pNo = item.noPalet || item.noPallet || item.NO_PALET || "";
    var pBin = item.slotRak || item.AREA_POSISI_BIN || item.lokasi || "";
    var pGudang = item.gudang || item.GUDANG || "Gudang SJA 3";
    var pJenis = item.jenisPallet || item.JENIS_PALLET || "Pallet Kayu";
    var pMuatan = (item.statusMuatan || item.STATUS_MUATAN || "TERISI").toUpperCase();
    var pFisik = (item.kondisiFisik || item.KONDISI_FISIK || "TIDAK_RUSAK").toUpperCase();
    var pKebersihan = (item.kondisiKebersihan || item.KONDISI_KEBERSIHAN || "BERSIH").toUpperCase();
    var pKondisi = (item.kondisi || item.STATUS_KONDISI || (pFisik === "RUSAK" ? "PERBAIKAN" : "BAIK")).toUpperCase();
    var pCatatan = item.catatan || item.CATATAN || "";
    var pFoto = item.foto || item.BUKTI_FOTO || "";
    var pPic = item.auditor || item.AUDITOR_PIC || "Auditor Gudang";

    rowsData.push([
      noUrut, pId, pTgl, pNo, pBin, pGudang,
      pJenis, pMuatan, pFisik, pKebersihan,
      pKondisi, pCatatan, pFoto, pPic, nowStr
    ]);
  }

  if (rowsData.length > 0) {
    outSheet.getRange(2, 1, rowsData.length, headers.length).setValues(rowsData);
  }

  // Header Styling Santos Jaya Abadi Emerald
  var hRange = outSheet.getRange(1, 1, 1, headers.length);
  hRange.setBackground("#065f46").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  outSheet.setFrozenRows(1);

  // Border & auto resize
  var allDataRange = outSheet.getRange(1, 1, rowsData.length + 1, headers.length);
  allDataRange.setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

  for (var col = 1; col <= headers.length; col++) {
    outSheet.autoResizeColumn(col);
  }

  return {
    status: "success",
    sourceSheet: srcSheet.getName(),
    sourceColumn: String.fromCharCode(64 + cIndex),
    targetSheet: targetSheetName,
    totalPallet: parsedItems.length,
    message: "Berhasil memecah " + parsedItems.length + " data palet ke sheet '" + targetSheetName + "'"
  };
}

/**
 * =========================================================================
 * CUSTOM FORMULAS UNTUK GOOGLE SHEETS
 * =========================================================================
 * Rumus yang dapat diketik langsung di Google Sheets untuk memecah teks JSON kolom D.
 * 
 * CONTOH PENGGUNAAN:
 * Di sel E2 ketik: =BREAKDOWN_PALLET(D2, "noPallet")
 * Di sel F2 ketik: =BREAKDOWN_PALLET(D2, "slotRak")
 * Di sel G2 ketik: =BREAKDOWN_PALLET(D2, "statusMuatan")
 * Di sel H2 ketik: =BREAKDOWN_PALLET(D2, "kondisi")
 * 
 * Atau 1 baris sekaligus:
 * Di sel E2 ketik: =BREAKDOWN_PALLET_ROW(D2)
 */

/**
 * Mengambil atribut spesifik dari string JSON di kolom D
 * @param {string} jsonCell Teks sel kolom D yang berisi JSON
 * @param {string} fieldName Nama atribut: "noPallet", "slotRak", "statusMuatan", "kondisiFisik", "kondisiKebersihan", "kondisi", "gudang", "tglAudit", "auditor", "catatan"
 * @param {number} [itemIndex=1] Urutan item jika di dalam sel terdapat array banyak palet
 * @return {string} Nilai atribut
 * @customfunction
 */
function BREAKDOWN_PALLET(jsonCell, fieldName, itemIndex) {
  if (!jsonCell) return "";
  var idx = (itemIndex && itemIndex > 0) ? (itemIndex - 1) : 0;
  try {
    var data = (typeof jsonCell === "string") ? JSON.parse(jsonCell) : jsonCell;
    var item = Array.isArray(data) ? data[idx] : data;
    if (!item) return "";

    var f = String(fieldName || "noPallet").trim().toLowerCase();
    var keyMap = {
      "nopallet": item.noPallet || item.noPalet || item.NO_PALET || "",
      "nopalet": item.noPalet || item.noPallet || item.NO_PALET || "",
      "slotrak": item.slotRak || item.AREA_POSISI_BIN || item.lokasi || "",
      "bin": item.slotRak || item.AREA_POSISI_BIN || item.lokasi || "",
      "area": item.slotRak || item.AREA_POSISI_BIN || item.lokasi || "",
      "gudang": item.gudang || item.GUDANG || "Gudang SJA 3",
      "jenispallet": item.jenisPallet || item.JENIS_PALLET || "Pallet Kayu",
      "statusmuatan": item.statusMuatan || item.STATUS_MUATAN || "TERISI",
      "muatan": item.statusMuatan || item.STATUS_MUATAN || "TERISI",
      "kondisifisik": item.kondisiFisik || item.KONDISI_FISIK || "TIDAK_RUSAK",
      "fisik": item.kondisiFisik || item.KONDISI_FISIK || "TIDAK_RUSAK",
      "kondisikebersihan": item.kondisiKebersihan || item.KONDISI_KEBERSIHAN || "BERSIH",
      "kebersihan": item.kondisiKebersihan || item.KONDISI_KEBERSIHAN || "BERSIH",
      "kondisi": item.kondisi || item.STATUS_KONDISI || "BAIK",
      "statuskondisi": item.kondisi || item.STATUS_KONDISI || "BAIK",
      "tglaudit": item.tglAudit || item.TANGGAL_STOCK_OPNAME || "",
      "tanggal": item.tglAudit || item.TANGGAL_STOCK_OPNAME || "",
      "auditor": item.auditor || item.AUDITOR_PIC || "",
      "pic": item.auditor || item.AUDITOR_PIC || "",
      "catatan": item.catatan || item.CATATAN || "",
      "id": item.id || item.ID || ""
    };
    return keyMap[f] !== undefined ? keyMap[f] : (item[fieldName] || "");
  } catch (err) {
    var reg = new RegExp('"' + fieldName + '"\\s*:\\s*"([^"]+)"', 'i');
    var match = String(jsonCell).match(reg);
    return match ? match[1] : "";
  }
}

/**
 * Melebarkan sel JSON kolom D menjadi kolom-kolom rapi horizontal
 * @param {string} jsonCell Teks sel kolom D yang berisi JSON
 * @param {number} [itemIndex=1] Urutan item jika di dalam sel terdapat array banyak palet
 * @return {Array} Baris berisi nilai atribut
 * @customfunction
 */
function BREAKDOWN_PALLET_ROW(jsonCell, itemIndex) {
  if (!jsonCell) return [["", "", "", "", "", "", "", "", "", "", "", ""]];
  var idx = (itemIndex && itemIndex > 0) ? (itemIndex - 1) : 0;
  try {
    var data = (typeof jsonCell === "string") ? JSON.parse(jsonCell) : jsonCell;
    var item = Array.isArray(data) ? data[idx] : data;
    if (!item) return [["", "", "", "", "", "", "", "", "", "", "", ""]];

    return [[
      item.id || item.ID || "",
      item.tglAudit || item.TANGGAL_STOCK_OPNAME || "",
      item.noPallet || item.noPalet || item.NO_PALET || "",
      item.slotRak || item.AREA_POSISI_BIN || "",
      item.gudang || item.GUDANG || "Gudang SJA 3",
      item.jenisPallet || item.JENIS_PALLET || "Pallet Kayu",
      item.statusMuatan || item.STATUS_MUATAN || "TERISI",
      item.kondisiFisik || item.KONDISI_FISIK || "TIDAK_RUSAK",
      item.kondisiKebersihan || item.KONDISI_KEBERSIHAN || "BERSIH",
      item.kondisi || item.STATUS_KONDISI || "BAIK",
      item.catatan || item.CATATAN || "",
      item.auditor || item.AUDITOR_PIC || ""
    ]];
  } catch (err) {
    return [["Error: " + err.message]];
  }
}

/**
 * Helper untuk menghapus data palet dari sheet STOCK_OPNAME_PALLET_RAPI jika ada
 */
function deleteFromRapiSheet(ss, targetId, noPalet) {
  try {
    var targetSpreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
    var rapiSheet = targetSpreadsheet.getSheetByName("STOCK_OPNAME_PALLET_RAPI");
    if (!rapiSheet || rapiSheet.getLastRow() < 1) return;
    var rLastRow = rapiSheet.getLastRow();
    var rLastCol = Math.max(1, rapiSheet.getLastColumn());
    var sNo = String(noPalet || "").trim().toLowerCase();
    var sId = String(targetId || "").trim().toLowerCase();

    for (var rk = rLastRow; rk >= 1; rk--) {
      var rowDisp = rapiSheet.getRange(rk, 1, 1, rLastCol).getDisplayValues()[0];
      if (rk === 1 && rLastRow > 1 && isGenericHeaderRow(rowDisp)) continue;
      var matchRapi = false;
      for (var cR = 0; cR < rLastCol; cR++) {
        var cVal = String(rowDisp[cR] || "").trim().toLowerCase();
        if ((sId && cVal === sId) || (sNo && cVal === sNo)) {
          matchRapi = true;
          break;
        }
      }
      if (matchRapi) {
        safelyDeleteOrClearRow(rapiSheet, rk);
      }
    }
  } catch (e) {}
}


