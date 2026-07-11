export function panjarLuarNegeriPrintTemplate(data: any) {
  const { btoRow, owner, ptRow, dpRow, logs, LOGO_SRC, esc, dateText, durationDays, money, financeQr } = data;

  const departureTime = btoRow.estBerangkat ? new Date(btoRow.estBerangkat).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', timeZone: 'Asia/Jakarta'}).replace('.', ':') : '07:00';
  const arrivalTime = btoRow.estKembali ? new Date(btoRow.estKembali).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', timeZone: 'Asia/Jakarta'}).replace('.', ':') : '23:00';

  const jobLevelName = (level: number) => {
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
    if (!kat || kat.toLowerCase() === 'lain_lain' || kat.toLowerCase() === 'lain-lain') {
      return 'OTHERS / BIAYA LAIN';
    }
    return kat.toUpperCase();
  };

  const groupedRincian = rincianList.reduce((acc: any, curr: any) => {
    const k = curr.kategori || 'lain_lain';
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
          <td style="font-weight: bold;">: &nbsp; ${catTotalStr}</td>
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
                        font-size: 9.5px;
                        line-height: 1.6;
                        color: black;
                        margin: 0;
                }
                @media screen {
                        body {
                                margin: 40px auto;
                                max-width: 210mm;
                                padding: 8mm 8mm 30px;
                                background: white;
                                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
                                border: 1px solid #ddd;
                        }
                        html {
                                background: #f3f4f6;
                        }
                        .no-print {
                                max-width: 210mm;
                                margin: 0 auto 10px;
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
                        padding: 4px 6px;
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
                        padding: 6px 6px;
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
                .footer-table {
                        width: 100%;
                        margin-top: 12px;
                        page-break-inside: avoid;
                }
                .footer-table td {
                        text-align: center;
                        vertical-align: top;
                        width: 33.33%;
                }
                .personalia-qr-box {
                        height: 55px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 2px 0;
                }
                .personalia-qr {
                        width: 50px;
                        height: 50px;
                        object-fit: contain;
                }
                .personalia-qr-placeholder {
                        font-family: Arial, Helvetica, sans-serif;
                        width: 50px;
                        height: 50px;
                        border: 1px dashed #666;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #777;
                        font-size: 9px;
                        line-height: 1;
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
                        <col style="width: 5%;">
                        <col style="width: 5%;">
                        <col style="width: 30%;">
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
                        <td>: &nbsp; ${jobLevelName(owner?.gradeLevel)}</td>
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

        <!-- Footer Sign Personalia / Reviewer -->
        <table class="footer-table" border="0" cellspacing="0" cellpadding="0" style="margin-top: 20px;">
                <tr>
                        <td width="60%"></td>
                        <td align="center" style="font-size: 11px;">
                                <p style="margin-bottom: 5px;"><b>Reviewed & Approved by Finance:</b></p>
                                ${financeQr ? `
                                <img src="${financeQr}" style="width: 65px; height: 65px; object-fit: contain; margin-bottom: 5px;" />
                                ` : `
                                <div style="height: 65px; border: 1px dashed #777; width: 65px; margin-bottom: 5px; display: flex; align-items: center; justify-content: center; color: #777; font-size: 9px; font-weight: 800;">QR</div>
                                `}
                                <p style="margin-top: 5px;"><strong>${esc(logs.find((l: any) => l.aksi === 'approve')?.actorNama || 'GA Administrator')}</strong></p>
                        </td>
                </tr>
        </table>

        <!-- Factory Address Footer -->
        <table class="address-footer" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                        <td align="center" style="font-size: 8px; color: #555; line-height: 1.3;">
                                <span style="color: #c2410c; font-weight: bold;">Factory & Main Office:</span> Special Economic Zone - Sei Mangkei, Jl. Kelapa Sawit II Kav. 2-3, Kec. Bosar Maligas, Kab. Simalungun 21184, North Sumatera - Indonesia. P: +62 622 7297 252. E: cs@inl.co.id
                                <br>
                                <span style="color: #c2410c; font-weight: bold;">Representative & Marketing Office:</span> Jl. Iskandar Muda No. 115, Medan 20119, North Sumatra - Indonesia. P: +62 61 4521 668. E: cs@inl.co.id &nbsp;|&nbsp; <span style="text-decoration: underline; color: #c2410c; font-weight: bold;">www.inl.co.id</span>
                        </td>
                </tr>
        </table>
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
