export function btoPrintTemplate(btoRow: any, owner: any, pemberiTugasRow: any, sdmLog: any, sdmName: string, LOGO_SRC: string, esc: any, dateText: any, durationDays: any, employeeQr?: string | null, ptQr?: string | null, sdmQr?: string | null) {
        const signatureMark = (qr?: string | null) => qr
                ? `<img src="${qr}" class="signature-qr" />`
                : `<div class="signature-check">&#10003;</div>`;

        return `
<!DOCTYPE html>
<html>
<head>
        <title>BTO</title>
        <style type="text/css">
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
                @page { size: portrait; margin: 15mm; }
                * { box-sizing: border-box; }
                body {
                        font-family: "Times New Roman", Times, serif;
                        font-size: 13px;
                        line-height: 1.35;
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
                                position: relative;
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
                .section-table {
                        width: 100%;
                        border: 1px solid black;
                        margin-top: 8px;
                }
                .section-table td {
                        padding: 7px 10px;
                        vertical-align: top;
                }
                .sizing-row td {
                        height: 0 !important;
                        padding: 0 !important;
                        border: 0 !important;
                        line-height: 0 !important;
                        font-size: 0 !important;
                }
                .label-cell { width: 20%; }
                .colon-cell { width: 2%; text-align: center; }
                .indent-cell { width: 8%; }
                .detail-title {
                        text-align: center;
                        font-size: 18px;
                        font-weight: bold;
                        letter-spacing: .5px;
                        padding-top: 10px !important;
                        padding-bottom: 22px !important;
                }
                .signature-table {
                        width: 100%;
                        border: 1px solid black;
                        margin-top: 8px;
                }
                .signature-table td {
                        vertical-align: top;
                        padding: 10px 16px;
                }
                .signature-date {
                        font-size: 14px;
                        padding-bottom: 22px !important;
                }
                .signature-cell {
                        width: 33.33%;
                        text-align: center;
                        font-size: 13px;
                        font-weight: bold;
                }
                .signature-box {
                        height: 100px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                }
                .signature-qr {
                        width: 72px;
                        height: 72px;
                        object-fit: contain;
                }
                .signature-check {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 86px;
                        line-height: 1;
                        font-weight: 900;
                }
                .signature-name {
                        text-decoration: underline;
                        margin-top: 4px;
                }
                .signature-position {
                        margin-top: 2px;
                }
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
                                <td class="meta-value-cell">INLHO/HRD-F/017</td>
                                <td class="meta-value-cell">12-Nov-18</td>
                        </tr>
                        <tr class="text-center">
                                <th class="meta-title-cell">No. Revisi</th>
                                <th class="meta-title-cell">Halaman</th>
                        </tr>
                        <tr class="text-center">
                                <th class="doc-title-cell">BUSINESS TRIP ORDER (BTO)</th>
                                <td class="meta-value-cell">00</td>
                                <td class="meta-value-cell">1 dari 1</td>
                        </tr>
                </thead>
        </table>

        <table class="section-table">
                <colgroup>
                        <col style="width: 8%;">
                        <col style="width: 20%;">
                        <col style="width: 2%;">
                        <col style="width: 70%;">
                </colgroup>
                <tr class="sizing-row"><td></td><td></td><td></td><td></td></tr>
                <tr>
                        <td class="indent-cell"></td>
                        <td class="label-cell">Nama Karyawan</td>
                        <td class="colon-cell">:</td>
                        <td>${esc(btoRow.employeeNama ?? owner?.nama)}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>Jabatan</td>
                        <td class="colon-cell">:</td>
                        <td>${esc(owner?.gradeKode ?? '-')}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>Departemen</td>
                        <td class="colon-cell">:</td>
                        <td>${esc(owner?.unitNama ?? '-')}</td>
                </tr>
        </table>

        <table class="section-table">
                <colgroup>
                        <col style="width: 8%;">
                        <col style="width: 20%;">
                        <col style="width: 2%;">
                        <col style="width: 70%;">
                </colgroup>
                <tr class="sizing-row"><td></td><td></td><td></td><td></td></tr>
                <tr>
                        <td colspan="4" class="detail-title">DETAIL</td>
                </tr>
                <tr>
                        <td class="indent-cell"></td>
                        <td class="label-cell">Tujuan</td>
                        <td class="colon-cell">:</td>
                        <td>${esc(btoRow.tujuanNama)}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>Keperluan</td>
                        <td class="colon-cell">:</td>
                        <td>${esc(btoRow.kepentingan)}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>Lama Perjalanan</td>
                        <td class="colon-cell">:</td>
                        <td>${dateText(btoRow.estBerangkat)} &nbsp; s/d &nbsp; ${dateText(btoRow.estKembali)}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>Jarak Perjalanan</td>
                        <td class="colon-cell">:</td>
                        <td>${esc(btoRow.jarakKm ? `${btoRow.jarakKm} Km` : '-')}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>Lama</td>
                        <td class="colon-cell">:</td>
                        <td>${durationDays(btoRow.estBerangkat, btoRow.estKembali)} Hari</td>
                </tr>
                <tr>
                        <td></td>
                        <td>Transport</td>
                        <td class="colon-cell">:</td>
                        <td>${esc(btoRow.transportLabel || '-')}</td>
                </tr>
        </table>

        <table class="signature-table">
                <tr>
                        <td colspan="3" class="signature-date">Diajukan Tanggal, ${dateText(btoRow.submittedAt || btoRow.createdAt)}</td>
                </tr>
                <tr>
                        <td class="signature-cell">
                                <div>Pelaksana Tugas</div>
                                <div class="signature-box">${signatureMark(employeeQr)}</div>
                                <div class="signature-name">${esc(btoRow.employeeNama ?? owner?.nama)}</div>
                                <div class="signature-position">${esc(owner?.gradeKode || '-')} ${esc(owner?.unitNama || '')}</div>
                        </td>
                        <td class="signature-cell">
                                <div>Pemberi Tugas</div>
                                <div class="signature-box">${signatureMark(ptQr)}</div>
                                <div class="signature-name">${esc(btoRow.pemberiTugasNama)}</div>
                                <div class="signature-position">${esc(pemberiTugasRow?.gradeKode || 'Atasan')} ${esc(pemberiTugasRow?.unitNama || '')}</div>
                        </td>
                        <td class="signature-cell">
                                <div>Diketahui</div>
                                <div class="signature-box">${signatureMark(sdmQr)}</div>
                                <div class="signature-name">${esc(sdmName || 'admin-sdm')}</div>
                                <div class="signature-position">ADM-SDM</div>
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
