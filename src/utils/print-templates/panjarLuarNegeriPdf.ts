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

  return `
<!DOCTYPE html>
<html>
<head>
        <title>Detail of Down Payment (DP) Abroad</title>
        <style type="text/css">
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
                @page { size: portrait; margin: 15mm; }
                * { box-sizing: border-box; }
                body {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 10px;
                        line-height: 1.3;
                        color: black;
                        margin: 0;
                }
                @media screen {
                        body {
                                margin: 40px auto;
                                max-width: 210mm;
                                padding: 15mm;
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
                .under {
                        text-decoration: underline;
                }
                .bold {
                        font-weight: bold;
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
                        border-collapse: collapse;
                        margin-top: 10px;
                }
                .content-table td {
                        border: 1px solid black;
                        padding: 4px 6px;
                        vertical-align: top;
                }
                .no-border-left-right {
                        border-left: 0 !important;
                        border-right: 0 !important;
                }
                .footer-table {
                        width: 100%;
                        margin-top: 15px;
                }
                .address-footer {
                        width: 100%;
                        margin-top: 20px;
                        font-size: 8px;
                        color: #555;
                        line-height: 1.3;
                        border-top: 1px solid #ddd;
                        padding-top: 8px;
                        text-align: center;
                }
                .no-print { margin: 0 auto 10px; text-align: right; }
                .no-print button { padding: 6px 10px; border: 1px solid #0f766e; border-radius: 4px; background: #0f766e; color: white; font-weight: 700; cursor: pointer; }
                @media print { .no-print { display: none; } }
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
                <tr>
                        <td width="5%" align="center">I</td>
                        <td width="30%" class="bold" style="font-style: italic;">SPJ/BTO NUMBER</td>
                        <td>: &nbsp; ${esc(btoRow.nomorBto || 'SURAT BELUM DITERBITKAN')}</td>
                </tr>
                <tr>
                        <td align="center">II</td>
                        <td class="bold" style="font-style: italic;">NAME</td>
                        <td>: &nbsp; ${esc((btoRow.employeeNama || owner?.nama || '').toUpperCase())}</td>
                </tr>
                <tr>
                        <td align="center">III</td>
                        <td class="bold" style="font-style: italic;">POSITION</td>
                        <td>: &nbsp; ${esc((owner?.gradeKode || '').toUpperCase())}</td>
                </tr>
                <tr>
                        <td align="center">IV</td>
                        <td class="bold" style="font-style: italic;">JOB LEVEL</td>
                        <td>: &nbsp; ${jobLevelName(owner?.gradeLevel)}</td>
                </tr>
                <tr>
                        <td align="center">V</td>
                        <td class="bold" style="font-style: italic;">DESTINATION</td>
                        <td>: &nbsp; ${esc(btoRow.tujuanNama).toUpperCase()}</td>
                </tr>
                <tr>
                        <td align="center">VI</td>
                        <td class="bold" style="font-style: italic;">NECESSARY</td>
                        <td>: &nbsp; ${esc(btoRow.kepentingan).toUpperCase()}</td>
                </tr>
                <tr>
                        <td align="center">VII</td>
                        <td class="bold" style="font-style: italic;">TOTAL DAYS</td>
                        <td>: &nbsp; ${durationDays(btoRow.estBerangkat, btoRow.estKembali)} HARI</td>
                </tr>
                <tr>
                        <td align="center">VIII</td>
                        <td class="bold" style="font-style: italic;" colspan="2">PERIODE</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">VIII.1 START</td>
                        <td>: &nbsp; ${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">VIII.2 END</td>
                        <td>: &nbsp; ${dateText(btoRow.estKembali).toUpperCase()}</td>
                </tr>
                <tr>
                        <td align="center">IX</td>
                        <td class="bold" style="font-style: italic;" colspan="2">DESCRIPTION OF SCHEDULE</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">IX.1 DEPARTURE DATE</td>
                        <td>: &nbsp; ${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">IX.2 DEPARTURE TIME</td>
                        <td>: &nbsp; ${departureTime}</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">IX.3 ARRIVAL DATE</td>
                        <td>: &nbsp; ${dateText(btoRow.estKembali).toUpperCase()}</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">IX.4 ARRIVAL TIME</td>
                        <td>: &nbsp; ${arrivalTime}</td>
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
                                <div style="height: 65px; border: 1px dashed #ccc; width: 65px; margin-bottom: 5px; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 9px;">Pending</div>
                                `}
                                <p style="margin-top: 5px;"><strong>GA Administrator</strong></p>
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
