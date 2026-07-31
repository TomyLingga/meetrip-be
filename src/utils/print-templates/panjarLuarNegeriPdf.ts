export function panjarLuarNegeriPrintTemplate(data: any) {
  const { btoRow, owner, ptRow, dpRow, logs, LOGO_SRC, esc, dateText, durationDays, money, financeQr, tipeRincianMap = {} } = data;

  const departureTime = btoRow.estBerangkat ? new Date(btoRow.estBerangkat).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', timeZone: 'Asia/Jakarta'}).replace('.', ':') : '07:00';
  const arrivalTime = btoRow.estKembali ? new Date(btoRow.estKembali).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', timeZone: 'Asia/Jakarta'}).replace('.', ':') : '23:00';

  const financeQrMark = financeQr
    ? `<img src="${financeQr}" class="personalia-qr" />`
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

  let romanIndex = 0;
  const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  let currentRoman = '';
  const nextRoman = () => {
    currentRoman = ROMANS[romanIndex++] || '';
    return currentRoman;
  };

  const rincianList = dpRow?.dpRincian || [];
  
  const formatKategoriName = (kat: string) => {
    if (!kat) return 'LAIN-LAIN / OTHERS';
    const k = kat.trim().toLowerCase();
    if (tipeRincianMap && tipeRincianMap[k]) {
      return tipeRincianMap[k].toUpperCase();
    }
    switch (k) {
      case 'saku': return 'UANG SAKU / POCKET MONEY';
      case 'hotel': return 'AKOMODASI / HOTEL';
      case 'laundry': return 'LAUNDRY';
      case 'transport': return 'TRANSPORTASI / TRAVEL';
      case 'meal': return 'UANG MAKAN / MEAL ALLOWANCE';
      case 'lain_lain':
      case 'lain-lain':
      case 'others':
        return 'LAIN-LAIN / OTHERS';
      default:
        return kat ? kat.replace(/_/g, ' ').toUpperCase() : 'LAIN-LAIN / OTHERS';
    }
  };

  const groupedRincian = rincianList.reduce((acc: any, curr: any) => {
    let k = curr.kategori || 'lain_lain';
    k = k.toLowerCase();
    if (k === 'lain-lain' || k === 'others') k = 'lain_lain';
    if (!acc[k]) acc[k] = [];
    acc[k].push(curr);
    return acc;
  }, {});

  const formatCatVal = (val: { idr: number, usd: number }) => {
    const parts = [];
    if (val.usd > 0) parts.push(money(val.usd, true));
    if (val.idr > 0 || parts.length === 0) parts.push(money(val.idr, false));
    return parts.join(' + ');
  };

  const getDynamicDetailHtml = (romanNumber: string) => {
    let html = '';
    let catIndex = 1;
    for (const [kategori, items] of Object.entries(groupedRincian)) {
      let itemsHtml = '';
      let catTotalIdr = 0;
      let catTotalUsd = 0;

      let itemIndex = 1;
      (items as any[]).forEach(item => {
        const valUsd = item.useDollar ? Number(item.nilaiTotal) || 0 : 0;
        const valIdr = !item.useDollar ? Number(item.nilaiTotal) || 0 : 0;
        
        catTotalUsd += valUsd;
        catTotalIdr += valIdr;

        const parts = [];
        if (valUsd > 0) parts.push(money(valUsd, true));
        if (valIdr > 0 || parts.length === 0) parts.push(money(valIdr, false));
        const valStr = parts.join(' + ');

        itemsHtml += `
          <tr>
            <td></td>
            <td></td>
            <td style="font-style: italic; padding-left: 5px; font-weight: normal;">${romanNumber}.${catIndex}.${itemIndex}</td>
            <td style="font-style: italic; font-weight: normal;">${esc(item.rincianLabel || '-')}</td>
            <td>: &nbsp; ${valStr}</td>
          </tr>
        `;
        itemIndex++;
      });

      const catParts = [];
      if (catTotalUsd > 0) catParts.push(money(catTotalUsd, true));
      if (catTotalIdr > 0 || catParts.length === 0) catParts.push(money(catTotalIdr, false));
      const catTotalStr = catParts.join(' + ');

      html += `
        <tr>
          <td></td>
          <td style="font-style: italic; padding-left: 20px; font-weight: bold;">${romanNumber}.${catIndex}</td>
          <td style="font-style: italic; font-weight: bold;" colspan="2">${formatKategoriName(kategori)}</td>
          <td></td>
        </tr>
        ${itemsHtml}
      `;
      catIndex++;
    }
    return html;
  };

  return `
<!DOCTYPE html>
<html>
<head>
        <title>Detail of Down Payment (DP) Abroad</title>
        <style type="text/css">
                @page { size: portrait; margin: 8mm 8mm 12mm; }
                * { box-sizing: border-box; }
                body {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 11px;
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
                /* Document Header Table */
                .header-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        margin-bottom: 6px;
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
                        padding: 3px !important;
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
                        font-size: 12px;
                        font-weight: 800;
                        color: #000;
                        letter-spacing: 0.5px;
                        text-transform: uppercase;
                }
                .company-subtitle {
                        font-size: 9px;
                        color: #000;
                        font-weight: 700;
                        margin-top: 1px;
                        text-transform: uppercase;
                }
                .company-address {
                        font-size: 8px;
                        color: #000;
                        margin-top: 2px;
                        line-height: 1.2;
                        font-weight: 500;
                }
                .meta-title-cell {
                        width: 17.5%;
                        font-weight: 700;
                        font-size: 9px;
                        text-transform: uppercase;
                        color: #000;
                        text-align: center;
                }
                .meta-value-cell {
                        width: 17.5%;
                        font-size: 9px;
                        text-align: center;
                        font-weight: 600;
                        color: #000;
                }
                .doc-title-cell {
                        font-size: 10px;
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
                        border: 1px solid black;
                        margin-top: 8px;
                }
                .content-table td {
                        border: 1px solid black;
                        padding: 2px 6px;
                        vertical-align: middle;
                }
                .biaya-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 8px;
                }
                .biaya-table th, .biaya-table td {
                        border: 1px solid black;
                        padding: 6px 6px;
                }
                .biaya-table th {
                        background-color: #f1f5f9;
                        font-weight: bold;
                        text-align: center;
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
                .address-footer table {
                        width: 100%;
                        border: none;
                }
                .address-footer td {
                        border: none;
                        vertical-align: bottom;
                }
                .address-footer .orange {
                        color: #c2410c;
                        font-weight: bold;
                        margin-bottom: 2px;
                }
                .address-footer .center {
                        text-align: center;
                        color: #c2410c;
                        font-weight: bold;
                        padding-bottom: 4px;
                }
                .address-footer .right {
                        text-align: right;
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
                        margin-top: 10px;
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
                .underline {
                        text-decoration: underline;
                }
                .no-print { margin: 0 auto 10px; text-align: right; }
                .no-print button { padding: 6px 10px; border: 1px solid #0f766e; border-radius: 4px; background: #0f766e; color: white; font-weight: 700; cursor: pointer; }
                @media print {
                        .no-print {
                                display: none;
                        }
                }
        </style>
</head>
<body>
        <div class="no-print"><button onclick="window.print()">Cetak / Simpan PDF</button></div>

        <div class="print-page">
                <!-- Header Table -->
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
                                        <th class="doc-title-cell">DETAIL OF DOWN PAYMENT (DP) ABROAD</th>
                                        <td class="meta-value-cell">01</td>
                                        <td class="meta-value-cell">1 dari 1</td>
                                </tr>
                        </thead>
                </table>

                <!-- Content Table -->
                <table class="content-table">
                        <colgroup>
                                <col style="width: 5%;">
                                <col style="width: 7%;">
                                <col style="width: 8%;">
                                <col style="width: 25%;">
                                <col style="width: 55%;">
                        </colgroup>
                        <tr>
                                <td align="center">${nextRoman()}</td>
                                <td class="bold" style="font-style: italic;" colspan="3">SPJ/BTO NUMBER</td>
                                <td>: &nbsp; ${esc(btoRow.nomorBto || 'SURAT BELUM DITERBITKAN')}</td>
                        </tr>
                        <tr>
                                <td align="center">${nextRoman()}</td>
                                <td class="bold" style="font-style: italic;" colspan="3">NAME</td>
                                <td>: &nbsp; ${esc((btoRow.employeeNama || owner?.nama || '').toUpperCase())}</td>
                        </tr>
                        <tr>
                                <td align="center">${nextRoman()}</td>
                                <td class="bold" style="font-style: italic;" colspan="3">POSITION</td>
                                <td>: &nbsp; ${esc((owner?.jabatan || '').toUpperCase())}</td>
                        </tr>
                        <tr>
                                <td align="center">${nextRoman()}</td>
                                <td class="bold" style="font-style: italic;" colspan="3">JOB LEVEL</td>
                                <td>: &nbsp; ${jobLevelName(owner)}</td>
                        </tr>
                        <tr>
                                <td align="center">${nextRoman()}</td>
                                <td class="bold" style="font-style: italic;" colspan="3">DESTINATION</td>
                                <td>: &nbsp; ${esc(btoRow.tujuanNama).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td align="center">${nextRoman()}</td>
                                <td class="bold" style="font-style: italic;" colspan="3">NECESSARY</td>
                                <td>: &nbsp; ${esc(btoRow.kepentingan).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td align="center">${nextRoman()}</td>
                                <td class="bold" style="font-style: italic;" colspan="3">TOTAL DAYS</td>
                                <td>: &nbsp; ${durationDays(btoRow.estBerangkat, btoRow.estKembali)} HARI</td>
                        </tr>
                        <tr>
                                <td align="center">${nextRoman()}</td>
                                <td class="bold" style="font-style: italic;" colspan="4">PERIODE</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td style="font-style: italic; padding-left: 20px;" colspan="2">${currentRoman}.1</td>
                                <td style="font-style: italic;">START</td>
                                <td>: &nbsp; ${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td style="font-style: italic; padding-left: 20px;" colspan="2">${currentRoman}.2</td>
                                <td style="font-style: italic;">END</td>
                                <td>: &nbsp; ${dateText(btoRow.estKembali).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td align="center">${nextRoman()}</td>
                                <td class="bold" style="font-style: italic;" colspan="4">DESCRIPTION OF SCHEDULE</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td style="font-style: italic; padding-left: 20px;" colspan="2">${currentRoman}.1</td>
                                <td style="font-style: italic;">DEPARTURE DATE</td>
                                <td>: &nbsp; ${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td style="font-style: italic; padding-left: 20px;" colspan="2">${currentRoman}.2</td>
                                <td style="font-style: italic;">DEPARTURE TIME</td>
                                <td>: &nbsp; ${departureTime}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td style="font-style: italic; padding-left: 20px;" colspan="2">${currentRoman}.3</td>
                                <td style="font-style: italic;">ARRIVAL DATE</td>
                                <td>: &nbsp; ${dateText(btoRow.estKembali).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td style="font-style: italic; padding-left: 20px;" colspan="2">${currentRoman}.4</td>
                                <td style="font-style: italic;">ARRIVAL TIME</td>
                                <td>: &nbsp; ${arrivalTime}</td>
                        </tr>
                        <tr>
                                <td align="center">${nextRoman()}</td>
                                <td class="bold" style="font-style: italic;" colspan="4">DETAIL OF DOWN PAYMENT</td>
                        </tr>
                        ${getDynamicDetailHtml(currentRoman)}
                        <tr class="bold">
                                <td></td>
                                <td style="font-style: italic; padding-left: 20px;" colspan="3">TOTAL DOWN PAYMENT</td>
                                <td>: &nbsp; ${dpRow ? formatCatVal({ idr: Number(dpRow.totalIdr || 0), usd: Number(dpRow.totalUsd || 0) }) : '-'}</td>
                        </tr>
                </table>
                <div class="personalia-qr-wrap">${financeQrMark}</div>
                <div class="sign-row">Sign by Personalia: &nbsp;<strong><em>${esc(logs.find((l: any) => l.aksi === 'approve')?.actorNama || 'GA Administrator')}</em></strong></div>
        </div>

        <!-- Factory Address Footer -->
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
