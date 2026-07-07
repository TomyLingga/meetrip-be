export function panjarPrintTemplate(
  btoRow: any,
  owner: any,
  ptRow: any,
  logs: any[],
  LOGO_SRC: string,
  esc: (val: any) => string,
  dateText: (date: any) => string,
  durationDays: (d1: any, d2: any) => number,
  money: (val: any, useDollar?: boolean) => string,
  dpRow: any,
  financeQr?: string | null
) {
  const departureTime = btoRow.estBerangkat ? new Date(btoRow.estBerangkat).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', timeZone: 'Asia/Jakarta'}).replace('.', ':') : '07:00';
  const arrivalTime = btoRow.estKembali ? new Date(btoRow.estKembali).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', timeZone: 'Asia/Jakarta'}).replace('.', ':') : '23:00';
  const financeQrMark = financeQr
    ? `<img src="${financeQr}" class="personalia-qr" />`
    : `<div class="personalia-qr-placeholder">QR</div>`;

  const jobLevelName = (level: number) => {
    switch (level) {
      case 1: return 'JUNIOR STAFF/EQUAL';
      case 2: return 'STAFF/EQUAL';
      case 3: return 'SENIOR STAFF/EQUAL';
      case 4: return 'EXECUTIVE/EQUAL';
      case 5: return 'GENERAL MANAGER/EQUAL';
      case 6: return 'DIRECTOR/EQUAL';
      case 13: return 'SEVP/COMMISSIONER/EQUAL';
      default: return 'GENERAL MANAGER/EQUAL';
    }
  };

  return `
<!DOCTYPE html>
<html>
<head>
        <title>Detail of Down Payment (DP)</title>
        <style type="text/css">
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
                @page { size: portrait; margin: 15mm 15mm 30mm; }
                * { box-sizing: border-box; }
                body {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 13px;
                        line-height: 1.25;
                        color: #20242a;
                        margin: 0;
                        padding-bottom: 98px;
                }
                @media screen {
                        body {
                                margin: 40px auto;
                                max-width: 210mm;
                                padding: 15mm 15mm 115px;
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
                        padding: 8px;
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
                        border: 1px solid #20242a;
                        margin-top: 18px;
                        font-size: 11px;
                }
                .content-table td {
                        border: 1px solid #20242a;
                        padding: 4px 5px;
                        vertical-align: middle;
                }
                .sizing-row td {
                        height: 0 !important;
                        padding: 0 !important;
                        border: 0 !important;
                        line-height: 0 !important;
                        font-size: 0 !important;
                }
                .roman { width: 5%; text-align: center; white-space: nowrap; }
                .subno { width: 10%; text-align: center; white-space: nowrap; overflow-wrap: normal !important; word-break: keep-all !important; font-size: 10px; }
                .label { width: 31%; font-weight: 800; font-style: italic; }
                .value { width: 60%; }
                .sign-row {
                        text-align: right;
                        margin-top: 8px;
                        padding-right: 40px;
                        font-size: 14px;
                }
                .personalia-qr-wrap {
                        display: flex;
                        justify-content: flex-end;
                        padding-right: 84px;
                        margin-top: 36px;
                }
                .personalia-qr,
                .personalia-qr-placeholder {
                        width: 62px;
                        height: 62px;
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
                                        <th class="doc-title-cell">DETAIL OF DOWN PAYMENT (DP)</th>
                                        <td class="meta-value-cell">01</td>
                                        <td class="meta-value-cell">1 dari 1</td>
                                </tr>
                        </thead>
                </table>

                <table class="content-table">
                        <colgroup>
                                <col style="width: 5%;">
                                <col style="width: 10%;">
                                <col style="width: 30%;">
                                <col style="width: 55%;">
                        </colgroup>
                        <tr class="sizing-row"><td></td><td></td><td></td><td></td></tr>
                        <tr>
                                <td class="roman">I</td>
                                <td class="label" colspan="2">SPJ/BTO NUMBER</td>
                                <td class="value">: &nbsp; ${esc(btoRow.nomorBto || 'SURAT BELUM DITERBITKAN')}</td>
                        </tr>
                        <tr>
                                <td class="roman">II</td>
                                <td class="label" colspan="2">NAME</td>
                                <td>: &nbsp; ${esc((btoRow.employeeNama || owner?.nama || '').toUpperCase())}</td>
                        </tr>
                        <tr>
                                <td class="roman">III</td>
                                <td class="label" colspan="2">POSITION</td>
                                <td>: &nbsp; ${esc((owner?.gradeKode || '').toUpperCase())}</td>
                        </tr>
                        <tr>
                                <td class="roman">IV</td>
                                <td class="label" colspan="2">JOB LEVEL</td>
                                <td>: &nbsp; ${jobLevelName(owner?.gradeLevel)}</td>
                        </tr>
                        <tr>
                                <td class="roman">V</td>
                                <td class="label" colspan="2">DESTINATION</td>
                                <td>: &nbsp; ${esc(btoRow.tujuanNama).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td class="roman">VI</td>
                                <td class="label" colspan="2">NECESSARY</td>
                                <td>: &nbsp; ${esc(btoRow.kepentingan).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td class="roman">VII</td>
                                <td class="label" colspan="2">TOTAL DAYS</td>
                                <td>: &nbsp; ${durationDays(btoRow.estBerangkat, btoRow.estKembali)} HARI</td>
                        </tr>
                        <tr>
                                <td class="roman">VIII</td>
                                <td class="label" colspan="3">PERIODE</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">VIII.1</td>
                                <td class="label">START</td>
                                <td>: &nbsp; ${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">VIII.2</td>
                                <td class="label">END</td>
                                <td>: &nbsp; ${dateText(btoRow.estKembali).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td class="roman">IX</td>
                                <td class="label" colspan="3">DESCRIPTION OF SCHEDULE</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">IX.1</td>
                                <td class="label">DEPARTURE DATE</td>
                                <td>: &nbsp; ${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">IX.2</td>
                                <td class="label">DEPARTURE TIME</td>
                                <td>: &nbsp; ${departureTime}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">IX.3</td>
                                <td class="label">ARRIVAL DATE</td>
                                <td>: &nbsp; ${dateText(btoRow.estKembali).toUpperCase()}</td>
                        </tr>
                        <tr>
                                <td></td>
                                <td class="subno">IX.4</td>
                                <td class="label">ARRIVAL TIME</td>
                                <td>: &nbsp; ${arrivalTime}</td>
                        </tr>
                </table>

                <div class="personalia-qr-wrap">${financeQrMark}</div>
                <div class="sign-row">Sign by Personalia: &nbsp;<strong><em>GA Administrator</em></strong></div>
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
