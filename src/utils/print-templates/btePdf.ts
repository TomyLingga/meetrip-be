export function btePrintTemplate(
  btoRow: any,
  owner: any,
  ptRow: any,
  logs: any[],
  LOGO_SRC: string,
  esc: (val: any) => string,
  dateText: (date: any) => string,
  durationDays: (d1: any, d2: any) => number,
  money: (val: any, useDollar?: boolean) => string,
  bteRow: any,
  dpRow: any,
  adminQr?: string | null,
  tipeRincianMap: Record<string, string> = {}
) {
  const departureTime = btoRow.estBerangkat ? new Date(btoRow.estBerangkat).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', timeZone: 'Asia/Jakarta'}).replace('.', ':') : '07:00';
  const arrivalTime = btoRow.estKembali ? new Date(btoRow.estKembali).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', timeZone: 'Asia/Jakarta'}).replace('.', ':') : '23:00';
  const adminQrMark = adminQr
    ? `<img src="${adminQr}" class="personalia-qr" />`
    : `<div class="personalia-qr-placeholder">QR</div>`;

  const jobLevelName = (ownerObj: any) => {
    if (ownerObj?.gradeLabel) return String(ownerObj.gradeLabel).toUpperCase();
    if (ownerObj?.gradeNama) return String(ownerObj.gradeNama).toUpperCase();
    if (ownerObj?.gradeKode) return String(ownerObj.gradeKode).toUpperCase();
    const level = typeof ownerObj === 'number' ? ownerObj : ownerObj?.gradeLevel;
    switch (level) {
      case 1: return 'JUNIOR STAFF/EQUAL';
      case 2: return 'STAFF/EQUAL';
      case 3: return 'SENIOR STAFF/EQUAL';
      case 4: return 'EXECUTIVE/EQUAL';
      case 5: return 'GENERAL MANAGER/EQUAL';
      case 6: return 'DIRECTOR/EQUAL';
      case 13: return 'SEVP/COMMISSIONER/EQUAL';
      default: return 'STAFF/EQUAL';
    }
  };

  const rincianList = bteRow?.bteRincian || [];

  const formatKategoriName = (kat: string) => {
    if (!kat) return 'ETC';
    const k = kat.trim().toLowerCase();
    if (k === 'etc' || k === 'lain_lain' || k === 'lain-lain' || k === 'others') {
      return 'ETC';
    }
    // Dynamic lookup from ref_tipe_rincian master table
    if (tipeRincianMap[k]) {
      return tipeRincianMap[k].toUpperCase();
    }
    return kat.replace(/_/g, ' ').toUpperCase();
  };

  const groupedRincian = rincianList.reduce((acc: any, curr: any) => {
    let k = curr.kategori || 'etc';
    k = k.toLowerCase().trim();
    if (k === 'lain-lain' || k === 'others' || k === 'lain_lain') k = 'etc';
    if (!acc[k]) acc[k] = [];
    acc[k].push(curr);
    return acc;
  }, {});

  let dynamicDetailHtml = '';
  let catIndex = 1;
  for (const [kategori, items] of Object.entries(groupedRincian)) {
    // Category header row: Col 1 empty, X.1 in Col 2 (Category Number), Category Name in Col 3 (colspan=3)
    dynamicDetailHtml += `
      <tr>
        <td></td>
        <td class="subno" style="font-weight: bold;">X.${catIndex}</td>
        <td class="label" style="font-weight: bold;" colspan="2">${formatKategoriName(kategori)}</td>
        <td></td>
      </tr>
    `;
    // Individual items: Col 1 empty, Col 2 empty, X.1.1 in Col 3 (Sub-item Number), Label in Col 4 (Expenditure), Value in Col 5
    (items as any[]).forEach((item, idx) => {
      const valStr = money(item.nilaiTotal, item.useDollar);
      dynamicDetailHtml += `
        <tr>
          <td></td>
          <td></td>
          <td class="subno" style="font-weight: normal; padding-left: 5px;">X.${catIndex}.${idx + 1}</td>
          <td class="label" style="font-weight: normal;">${esc(item.rincianLabel || '-')}</td>
          <td>: &nbsp; ${valStr}</td>
        </tr>
      `;
    });
    catIndex++;
  }

  const dpTotal = dpRow ? Number(dpRow.totalIdr || 0) : 0;
  const bteTotal = Number(bteRow?.totalIdr || 0);
  const finalTotal = bteTotal - dpTotal;

  // ETC section number comes after all categories
  const etcSectionIndex = catIndex;
  const etcRows = (bteRow?.bteBiayaLain || []).map((item: any, idx: number) => `
                        <tr>
                                <td></td>
                                <td></td>
                                <td class="subno" style="font-weight: normal; padding-left: 5px;">X.${etcSectionIndex}.${idx + 1}</td>
                                <td class="label" style="font-weight: normal;">${esc(item.keterangan)}</td>
                                <td>: &nbsp; ${money(item.nilai, item.useDollar)}</td>
                        </tr>`).join('');

  return `
<!DOCTYPE html>
<html>
<head>
        <title>Detail of Business Trip Expenses (BTE)</title>
        <style type="text/css">
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
                @page { size: portrait; margin: 8mm 8mm 12mm; }
                * { box-sizing: border-box; }
                body {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 9.5px;
                        line-height: 1.6;
                        color: #20242a;
                        margin: 0;
                        padding-bottom: 30px;
                }
                @media screen {
                        body {
                                margin: 40px auto;
                                max-width: 210mm;
                                padding: 8mm 8mm 40px;
                                background: white;
                                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
                                border: 1px solid #ddd;
                                position: relative;
                        }
                        html {
                                background: #f3f4f6;
                        }
                        .no-print {
                                max-width: 210mm;
                                margin: 0 auto 10px;
                        }
                        .address-footer {
                                position: absolute;
                                bottom: 15px;
                                left: 15mm;
                                right: 15mm;
                        }
                }
                table { border-collapse: collapse; table-layout: fixed; }
                td { overflow-wrap: anywhere; word-break: normal; }
                .bold { font-weight: bold; }
                .print-page {
                        border: 3px solid #20242a;
                        padding: 16px;
                        min-height: 210mm;
                }
                /* Document Header Table */
                .header-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        margin-bottom: 12px;
                }
                .header-table td, .header-table th {
                        border: 1px solid #000;
                        padding: 2px;
                        vertical-align: middle;
                        box-sizing: border-box;
                }
                .logo-cell {
                        width: 15%;
                        text-align: center;
                        padding: 5px !important;
                }
                .logo-img {
                        display: block;
                        margin: 0 auto;
                        max-width: 100%;
                        height: auto;
                        object-fit: contain;
                }
                .company-cell {
                        width: 50%;
                        text-align: center;
                }
                .company-title {
                        font-size: 14px;
                        font-weight: 800;
                        color: #000;
                        letter-spacing: 0.5px;
                        text-transform: uppercase;
                }
                .company-subtitle {
                        font-size: 10px;
                        color: #000;
                        font-weight: 700;
                        margin-top: 2px;
                        text-transform: uppercase;
                }
                .company-address {
                        font-size: 8px;
                        color: #000;
                        margin-top: 4px;
                        line-height: 1.3;
                        font-weight: 500;
                }
                .meta-title-cell {
                        width: 17.5%;
                        font-weight: 700;
                        font-size: 9.5px;
                        text-transform: uppercase;
                        color: #000;
                        text-align: center;
                }
                .meta-value-cell {
                        width: 17.5%;
                        font-size: 10px;
                        text-align: center;
                        font-weight: 600;
                        color: #000;
                }
                .doc-title-cell {
                        font-size: 11px;
                        font-weight: 800;
                        color: #000;
                        text-align: center;
                        letter-spacing: 0.5px;
                        text-transform: uppercase;
                }
                .text-center {
                        text-align: center;
                }
                .content-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 9px;
                }
                .content-table td {
                        border: 1px solid #20242a;
                        padding: 2px 4px;
                        vertical-align: middle;
                }
                .info-table {
                        margin-top: 6px;
                }
                .expense-table {
                        margin-top: -1px;
                }
                .expense-table tr:first-child td {
                        border-top: none !important;
                }
                .roman { width: 4%; text-align: center; white-space: nowrap; }
                .subno { text-align: center; white-space: nowrap; }
                .label { font-weight: 800; font-style: italic; }
                .info-label {
                        font-weight: 800;
                        font-style: italic;
                        border-right: none !important;
                }
                .info-value {
                        border-left: none !important;
                }
                .expense { width: 46%; }
                .amount { width: 36%; }
                .money-cell {
                        text-align: right;
                        padding-right: 8px !important;
                        white-space: nowrap;
                }
                .text-center { text-align: center; }
                .section-label {
                        font-weight: 800;
                        font-style: italic;
                }
                .total-label {
                        text-align: center;
                        font-weight: 800;
                        font-style: italic;
                }
                .sign-row {
                        text-align: right;
                        margin-top: 4px;
                        padding-right: 40px;
                        font-size: 11px;
                }
                .personalia-qr-wrap {
                        display: flex;
                        justify-content: flex-end;
                        padding-right: 84px;
                        margin-top: 8px;
                }
                .personalia-qr,
                .personalia-qr-placeholder {
                        width: 50px;
                        height: 50px;
                        object-fit: contain;
                }
                .personalia-qr-placeholder {
                        border: 1px dashed #777;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #777;
                        font-size: 10px;
                        font-weight: 800;
                }
                .address-footer {
                        position: fixed;
                        left: 8mm;
                        right: 8mm;
                        bottom: 0;
                        padding: 0 10px 2px;
                        font-family: "Times New Roman", Times, serif;
                        font-size: 9.5px;
                        line-height: 1.15;
                        color: #555;
                }
                .address-footer table { width: 100%; }
                .address-footer td { width: 33.33%; vertical-align: bottom; }
                .address-footer .orange {
                        color: #d97706;
                        font-weight: bold;
                        font-size: 15px;
                }
                .address-footer .center {
                        text-align: center;
                        color: #d97706;
                        font-weight: bold;
                        font-size: 15px;
                }
                .address-footer .right { text-align: right; }
                .no-print { margin: 0 auto 10px; text-align: right; }
                .no-print button { padding: 6px 10px; border: 1px solid #0f766e; border-radius: 4px; background: #0f766e; color: white; font-weight: 700; cursor: pointer; }
                @media print {
                        .no-print {
                                display: none;
                        }
                        body {
                                padding-left: 8mm;
                                padding-right: 8mm;
                        }
                }
        </style>
</head>
<body>
        <div class="no-print"><button onclick="window.print()">Cetak / Simpan PDF</button></div>

        <div class="print-page">
                <table class="header-table">
                        <thead>
                                <tr class="text-center">
                                        <td class="logo-cell" rowspan="4">
                                                <img src="${LOGO_SRC}" alt="Logo INL" class="logo-img" width="83">
                                        </td>
                                        <td class="company-cell" rowspan="3">
                                                <div class="company-title">PT. Industri Nabati Lestari</div>
                                                <div class="company-subtitle">Pabrik Minyak Goreng</div>
                                                <div class="company-address">
                                                        Komp. KEK Sei Mangkei, Kav. 2-3, Kec. Bosar Maligas, Kab. Simalungun, Sumatera Utara, 21184
                                                </div>
                                        </td>
                                        <th class="meta-title-cell">No. Dokumen</th>
                                        <th class="meta-title-cell">Tgl. Berlaku</th>
                                </tr>
                                <tr class="text-center">
                                        <td class="meta-value-cell">INLHO/BSIS-GEA/F-014</td>
                                        <td class="meta-value-cell">21-Mar-22</td>
                                </tr>
                                <tr class="text-center">
                                        <th class="meta-title-cell">No. Revisi</th>
                                        <th class="meta-title-cell">Halaman</th>
                                </tr>
                                <tr class="text-center">
                                        <th class="doc-title-cell">DETAIL OF BUSINESS TRIP EXPENSES (BTE)</th>
                                        <td class="meta-value-cell">01</td>
                                        <td class="meta-value-cell">1 dari 1</td>
                                </tr>
                        </thead>
                </table>

                <!-- Table 1: General Info & Schedule (Rows I to IX) -->
                <table class="content-table info-table">
                        <colgroup>
                                <col style="width: 4%;">
                                <col style="width: 6%;">
                                <col style="width: 26%;">
                                <col style="width: 64%;">
                        </colgroup>
                        <tr>
                                <td class="roman">I</td>
                                <td class="info-label" colspan="2">SPDK/BTO NUMBER</td>
                                <td class="info-value">: &nbsp; ${esc(btoRow.nomorBto || 'SURAT BELUM DITERBITKAN')}</td>
                        </tr>
                        <tr>
                                <td class="roman">II</td>
                                <td class="info-label" colspan="2">NAME</td>
                                <td class="info-value">: &nbsp; ${esc((btoRow.employeeNama || owner?.nama || '').toUpperCase())}</td>
                        </tr>
                        <tr>
                                <td class="roman">III</td>
                                <td class="info-label" colspan="2">POSITION</td>
                                <td class="info-value">: &nbsp; ${esc((owner?.jabatan || owner?.gradeKode || '').toUpperCase())}</td>
                        </tr>
                        <tr>
                                <td class="roman">IV</td>
                                <td class="info-label" colspan="2">JOB LEVEL</td>
                                <td class="info-value">: &nbsp; ${jobLevelName(owner)}</td>
                        </tr>
                        <tr>
                                <td class="roman">V</td>
                                <td class="info-label" colspan="2">DESTINATION</td>
                                <td class="info-value">: &nbsp; ${esc(btoRow.tujuanNama).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td class="roman">VI</td>
                                <td class="info-label" colspan="2">NECESSARY</td>
                                <td class="info-value">: &nbsp; ${esc(btoRow.kepentingan).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td class="roman">VII</td>
                                <td class="info-label" colspan="2">TOTAL DAYS</td>
                                <td class="info-value">: &nbsp; ${durationDays(btoRow.estBerangkat, btoRow.estKembali)} HARI</td>
                        </tr>
                        <tr>
                                <td class="roman">VIII</td>
                                <td class="label" colspan="3">PERIODE</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">VIII.1</td>
                                <td class="info-label">START</td>
                                <td class="info-value">: &nbsp; ${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">VIII.2</td>
                                <td class="info-label">END</td>
                                <td class="info-value">: &nbsp; ${dateText(btoRow.estKembali).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td class="roman">IX</td>
                                <td class="label" colspan="3">DESCRIPTION OF SCHEDULE</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">IX.1</td>
                                <td class="info-label">DEPARTURE DATE</td>
                                <td class="info-value">: &nbsp; ${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">IX.2</td>
                                <td class="info-label">DEPARTURE TIME</td>
                                <td class="info-value">: &nbsp; ${departureTime}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">IX.3</td>
                                <td class="info-label">ARRIVAL DATE</td>
                                <td class="info-value">: &nbsp; ${dateText(btoRow.estKembali).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">IX.4</td>
                                <td class="info-label">ARRIVAL TIME</td>
                                <td class="info-value">: &nbsp; ${arrivalTime}</td>
                        </tr>
                </table>

                <!-- Table 2: Detail of Travel Expenses (Section X) -->
                <table class="content-table expense-table">
                        <colgroup>
                                <col style="width: 4%;">
                                <col style="width: 6%;">
                                <col style="width: 8%;">
                                <col style="width: 46%;">
                                <col style="width: 36%;">
                        </colgroup>
                        <tr>
                                <td class="roman">X</td>
                                <td class="label" colspan="3" style="font-weight: bold;">DETAIL OF TRAVEL EXPENSES (BTE)</td>
                                <td></td>
                        </tr>
                        ${dynamicDetailHtml}
                        <tr>
                                <td></td>
                                <td class="subno" style="font-weight: bold;">X.${etcSectionIndex}</td>
                                <td class="label" style="font-weight: bold;" colspan="2">ETC</td>
                                <td></td>
                        </tr>
                        ${etcRows}
                        <tr class="bold">
                                <td></td>
                                <td class="label" colspan="3" style="text-align: right; padding-right: 15px;">TOTAL EXPENSES</td>
                                <td>: &nbsp; ${money(bteTotal)}</td>
                        </tr>
                        <tr class="bold">
                                <td></td>
                                <td class="label" colspan="3" style="text-align: right; padding-right: 15px;">DOWN PAYMENT</td>
                                <td>: &nbsp; ${money(dpTotal)}</td>
                        </tr>
                        <tr class="bold">
                                <td></td>
                                <td class="label" colspan="3" style="text-align: right; padding-right: 15px;">${finalTotal < 0 ? 'LEBIH BAYAR (REFUND TO COMPANY)' : finalTotal > 0 ? 'KURANG BAYAR (REIMBURSE TO EMPLOYEE)' : 'SELESAI (NIHIL)'}</td>
                                <td>: &nbsp; ${money(Math.abs(finalTotal))}</td>
                        </tr>
                </table>

                <div class="personalia-qr-wrap">${adminQrMark}</div>
                <div class="sign-row">Sign by Personalia: &nbsp;<strong><em>${esc(logs.find(l => l.aksi === 'approve')?.actorNama || 'GA Administrator')}</em></strong></div>
        </div>

        <div class="address-footer">
                <table>
                        <tr>
                                <td>
                                        <div class="orange">Factory &amp; Main Office:</div>
                                        Special Economic Zone - Sei Mangkei<br>
                                        Jl. Kelapa Sawit II Kav. 2-3<br>
                                        Kec. Bosar Maligas, Simalungun 21184<br>
                                        North Sumatera - Indonesia<br>
                                        P: +62 622 7297 252 &nbsp; F: +62 622 7297 255<br>
                                        E: cs@inl.co.id
                                </td>
                                <td class="center">www.inl.co.id</td>
                                <td class="right">
                                        <div class="orange">Representative &amp; Marketing Office:</div>
                                        Jl. Iskandar Muda No. 115<br>
                                        Medan 20119<br>
                                        North Sumatra - Indonesia<br>
                                        P: +62 61 4521 668
                                </td>
                        </tr>
                </table>
        </div>
        <script type="text/javascript">
          window.addEventListener('load', () => {
            setTimeout(() => {
              window.print();
            }, 500);
          });
        </script>
</body>
</html>
`;
}
