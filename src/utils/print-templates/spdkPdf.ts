export function spdkPrintTemplate(
        btoRow: any,
        owner: any,
        spdkRow: any,
        logs: any[],
        stamp: any,
        LOGO_SRC: string,
        esc: (val: any) => string,
        dateText: (date: any) => string,
        durationDays: (d1: any, d2: any) => number,
        kabagQr?: string | null,
        destinationQr?: string | null
) {
        const signatureMark = kabagQr
                ? `<img src="${kabagQr}" class="signature-qr" />`
                : `<div class="signature-placeholder">QR</div>`;
        const destinationQrMark = destinationQr
                ? `<img src="${destinationQr}" class="destination-qr" />`
                : `<div class="destination-placeholder">QR Lokasi Tujuan</div>`;

        return `
<!DOCTYPE html>
<html>
<head>
        <title>Surat Perintah Perjalanan Dinas Karyawan (SPDK)</title>
        <style type="text/css">
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
                @page { size: portrait; margin: 15mm 15mm 30mm; }
                * { box-sizing: border-box; }
                body {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 13px;
                        line-height: 1.32;
                        color: black;
                        margin: 0;
                        padding-bottom: 95px;
                }
                @media screen {
                        body {
                                margin: 40px auto;
                                max-width: 210mm;
                                padding: 15mm 15mm 110px;
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
                                margin: 0 auto 15px;
                        }
                        .address-footer {
                                position: absolute;
                                bottom: 15px;
                                left: 15mm;
                                right: 15mm;
                        }
                }
                table { border-collapse: collapse; table-layout: fixed; }
                td { overflow-wrap: anywhere; vertical-align: top; }
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
                .content-table {
                        width: 100%;
                        margin-bottom: 24px;
                }
                .content-table td {
                        padding: 2px 0;
                }
                .sizing-row td {
                        height: 0 !important;
                        padding: 0 !important;
                        border: 0 !important;
                        line-height: 0 !important;
                        font-size: 0 !important;
                }
                .number-col { width: 5%; }
                .subnumber-col { width: 5%; }
                .label-col { width: 24%; }
                .value-col { width: 66%; }
                .bullet-table {
                        width: 100%;
                }
                .bullet-table td {
                        padding: 3px 0;
                }
                .footer-table {
                        width: 100%;
                        margin-top: 18px;
                }
                .stempel-box {
                        width: 320px;
                        height: 170px;
                        border: 1px solid #555;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                }
                .stempel-label {
                        text-align: center;
                        font-size: 12px;
                        font-weight: 800;
                        font-style: italic;
                        text-decoration: underline;
                }
                .issued-table {
                        width: 100%;
                        font-size: 13px;
                }
                .issued-table td {
                        padding: 2px 0;
                }
                .signature-area {
                        text-align: center;
                        margin-top: 34px;
                }
                .signature-box {
                        height: 76px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                }
                .signature-qr {
                        width: 72px;
                        height: 72px;
                        object-fit: contain;
                }
                .signature-placeholder {
                        width: 72px;
                        height: 72px;
                        border: 1px dashed #666;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #777;
                        font-size: 11px;
                        line-height: 1;
                        font-weight: 800;
                }
                .destination-qr {
                        width: 92px;
                        height: 92px;
                        object-fit: contain;
                }
                .destination-placeholder {
                        width: 92px;
                        height: 92px;
                        border: 1px dashed #666;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #777;
                        font-size: 10px;
                        text-align: center;
                        padding: 8px;
                }
                .signature-name {
                        font-size: 14px;
                        font-weight: 800;
                        text-decoration: underline;
                }
                .copy-row {
                        margin-top: 42px;
                        font-size: 13px;
                }
                .address-footer {
                        margin-top: 60px;
                        padding-left: 14px;
                        padding-right: 14px;
                        font-family: "Times New Roman", Times, serif;
                        font-size: 10px;
                        line-height: 1.15;
                        color: #555;
                }
                .address-footer .orange {
                        color: #d97706;
                        font-weight: bold;
                        font-size: 15px;
                }
                .address-footer table {
                        width: 100%;
                }
                .address-footer td {
                        width: 33.33%;
                        vertical-align: bottom;
                }
                .address-footer .center {
                        text-align: center;
                        color: #d97706;
                        font-weight: bold;
                        font-size: 15px;
                }
                .address-footer .right {
                        text-align: right;
                }
                .no-print { margin: 0 auto 15px; text-align: right; }
                .no-print button { padding: 8px 12px; border: 1px solid #0f766e; border-radius: 4px; background: #0f766e; color: white; font-weight: 700; cursor: pointer; }
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
                                <td class="meta-value-cell">INLHO/HRD-F/015</td>
                                <td class="meta-value-cell">12-Nov-18</td>
                        </tr>
                        <tr class="text-center">
                                <th class="meta-title-cell">No. Revisi</th>
                                <th class="meta-title-cell">Halaman</th>
                        </tr>
                        <tr class="text-center">
                                <th class="doc-title-cell">SURAT PERINTAH PERJALANAN DINAS KARYAWAN</th>
                                <td class="meta-value-cell">00</td>
                                <td class="meta-value-cell">1 dari 1</td>
                        </tr>
                </thead>
        </table>

        <div style="text-align: center; margin-top: 14px; margin-bottom: 20px; font-weight: bold; font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #000; text-transform: uppercase;">
                Nomor: ${esc(spdkRow.nomorSpdk)}
        </div>

        <table class="content-table">
                <colgroup>
                        <col style="width: 5%;">
                        <col style="width: 5%;">
                        <col style="width: 23%;">
                        <col style="width: 67%;">
                </colgroup>
                <tr class="sizing-row"><td></td><td></td><td></td><td></td></tr>
                <tr class="bold">
                        <td class="number-col">I.</td>
                        <td colspan="3">Diberikan Kepada :</td>
                </tr>
                <tr>
                        <td></td>
                        <td class="subnumber-col">1.</td>
                        <td class="label-col">Nama</td>
                        <td class="value-col">: ${esc(btoRow.employeeNama ?? owner?.nama)}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>2.</td>
                        <td>Pangkat/Jabatan</td>
                        <td>: ${esc(owner?.jabatan ?? '-')}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>3.</td>
                        <td>Golongan</td>
                        <td>: ${esc(owner?.gradeKode ?? '-')}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>4.</td>
                        <td>Untuk bertugas ke</td>
                        <td>: ${esc(btoRow.tujuanNama)}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>5.</td>
                        <td>Keperluan/Urusan</td>
                        <td>: ${esc(btoRow.kepentingan)}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>6.</td>
                        <td>Berangkat tanggal</td>
                        <td>: ${dateText(btoRow.estBerangkat)}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>7.</td>
                        <td>Kembali tanggal</td>
                        <td>: ${dateText(btoRow.estKembali)}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>8.</td>
                        <td>Barang yang dibawa</td>
                        <td>: ${esc(btoRow.barang || '-')}</td>
                </tr>
                <tr>
                        <td></td>
                        <td>9.</td>
                        <td>Kendaraan</td>
                        <td>: ${esc(btoRow.transportLabel || '-')} -</td>
                </tr>
                <tr>
                        <td></td>
                        <td>10.</td>
                        <td>Rombongan</td>
                        <td>: -</td>
                </tr>
        </table>

        <table class="content-table">
                <colgroup>
                        <col style="width: 5%;">
                        <col style="width: 5%;">
                        <col style="width: 23%;">
                        <col style="width: 67%;">
                </colgroup>
                <tr class="sizing-row"><td></td><td></td><td></td><td></td></tr>
                <tr class="bold">
                        <td class="number-col">II.</td>
                        <td colspan="3">Catatan :</td>
                </tr>
                <tr>
                        <td></td>
                        <td colspan="3">
                                <table class="bullet-table">
                                        <tr><td class="subnumber-col">-</td><td>Biaya ditanggung oleh : PT. Industri Nabati Lestari</td></tr>
                                        <tr><td>-</td><td>Tanggal kembali dari perjalanan harap dilaporan kepada PT. Industri Nabati Lestari</td></tr>
                                        <tr><td>-</td><td>Mohon agar pihak berwajib memberikan bantuan seperlunya.</td></tr>
                                </table>
                        </td>
                </tr>
        </table>

        <table class="footer-table">
                <tr>
                        <td width="45%">
                                <div class="stempel-box">
                                        ${destinationQrMark}
                                        <div class="stempel-label">QR Lokasi Tujuan Dinas</div>
                                </div>
                        </td>
                        <td width="10%"></td>
                        <td width="45%">
                                <table class="issued-table">
                                        <tr>
                                                <td width="38%">Dikeluarkan di</td>
                                                <td width="4%">:</td>
                                                <td>Sei Mangkei</td>
                                        </tr>
                                        <tr>
                                                <td>Pada tanggal</td>
                                                <td>:</td>
                                                <td>${dateText(spdkRow.createdAt || new Date())}</td>
                                        </tr>
                                        <tr>
                                                <td colspan="3" class="bold">PT. Industri Nabati Lestari</td>
                                        </tr>
                                </table>
                                <div class="signature-area">
                                        <div class="signature-box">${signatureMark}</div>
                                        <div class="signature-name">${esc(spdkRow.approverKabagNama || 'Ferdiansyah')}</div>
                                        <div>Kabag SDM &amp; Sistem</div>
                                </div>
                        </td>
                </tr>
        </table>

        <div class="copy-row"><strong>Asli</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; : Bagian Finance</div>

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
