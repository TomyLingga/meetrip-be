export function btoPrintTemplate(btoRow: any, owner: any, pemberiTugasRow: any, sdmLog: any, sdmName: string, LOGO_SRC: string, esc: any, dateText: any, durationDays: any, employeeQr?: string | null, ptQr?: string | null, sdmQr?: string | null) {
        const signatureMark = (qr?: string | null) => qr
                ? `<img src="${qr}" class="signature-qr" />`
                : `<div class="signature-placeholder"></div>`;

        const formatUnitTipe = (tipe?: string | null) => {
                if (!tipe) return '';
                if (tipe.toLowerCase() === 'sevp') return 'SEVP';
                if (tipe.toLowerCase() === 'sub_bagian') return 'Sub Bagian';
                return tipe.charAt(0).toUpperCase() + tipe.slice(1).toLowerCase();
        };

        const formatUnitFull = (tipe?: string | null, nama?: string | null) => {
                const parts = [formatUnitTipe(tipe), nama].filter(Boolean);
                return parts.length > 0 ? parts.join(' ') : '-';
        };

        return `
<!DOCTYPE html>
<html>
<head>
        <title>BTO - ${esc(btoRow.employeeNama ?? owner?.nama)}</title>
        <style type="text/css">
                /* Pengaturan Kertas untuk memastikan fit 1 halaman */
                @page { 
                        size: A4 portrait; 
                        margin-top: 8mm;
                        margin-bottom: 8mm;
                        margin-left: 0;
                        margin-right: 0;
                }
                
                * { box-sizing: border-box; }
                
                body {
                        font-family: "Times New Roman", Times, serif;
                        font-size: 11px;
                        color: black;
                        margin: 0;
                        padding: 0;
                }
                
                @media screen {
                        body {
                                background: #f3f4f6;
                                padding: 20px;
                        }
                        .print-container {
                                margin: 0 auto;
                                max-width: 210mm;
                                min-height: 297mm;
                                
                                padding-top: 8mm;
                                padding-bottom: 8mm;
                                padding-left: 20mm;
                                padding-right: 15mm;
                                
                                background: white;
                                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
                                border: 1px solid #ccc;
                        }
                        .no-print {
                                max-width: 210mm;
                                margin: 0 auto 15px;
                                text-align: right;
                        }
                }

                @media print {
                        .no-print { display: none; }
                        .print-container { 
                                width: 100%; 
                                padding-left: 20mm; 
                                padding-right: 15mm; 
                                box-shadow: none; 
                                border: none; 
                        }
                }

                .no-print button { 
                        padding: 8px 16px; 
                        border: none; 
                        border-radius: 4px; 
                        background: #0f766e; 
                        color: white; 
                        font-weight: bold; 
                        cursor: pointer; 
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                /* 1. HEADER TABLE */
                .header-table {
                        width: 100%; 
                        border-collapse: collapse;
                        margin: 0 0 6px 0; 
                }
                .header-table td, .header-table th {
                        border: 1px solid #000;
                        padding: 4px 6px;
                        vertical-align: middle;
                }

                .logo-cell { width: 15%; text-align: center; }
                .logo-img { max-width: 75px; height: auto; object-fit: contain; }
                
                .company-cell { width: 55%; text-align: center; }
                .company-title { font-size: 13px; font-weight: bold; text-decoration: underline; display: block; }
                .company-subtitle { font-size: 11px; font-weight: bold; margin-top: 1px; display: block; }
                .company-address { font-size: 10px; margin-top: 2px; line-height: 1.15; display: block; }
                
                .doc-title-cell { font-size: 13px; font-weight: bold; text-align: center; padding: 8px !important;}
                
                .meta-title-cell { width: 15%; font-size: 10px; font-weight: bold; text-align: center; }
                .meta-value-cell { width: 15%; font-size: 10px; text-align: center; }

                /* 2. SECTION BOXES (Karyawan & Detail) */
                .content-box {
                        border: 1px solid #000;
                        margin: 0 0 6px 0; 
                        padding: 8px 20px;
                }
                .form-table {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                }
                .form-table td {
                        padding: 4px 0;
                        vertical-align: top;
                        font-size: 11px;
                }
                .col-label { width: 22%; }
                .col-colon { width: 3%; text-align: left; }
                .col-value { width: 75%; }
                
                .detail-title {
                        text-align: center;
                        font-size: 13px;
                        font-weight: bold;
                        margin-bottom: 8px;
                }

                /* 3. SIGNATURE BOX */
                .sig-box {
                        border: 1px solid #000;
                        margin: 0 0; 
                        padding: 8px 20px;
                        page-break-inside: avoid;
                }
                .sig-date {
                        font-size: 11px;
                        margin-bottom: 12px;
                }
                .sig-table {
                        width: 100%;
                        table-layout: fixed;
                }
                .sig-table td {
                        width: 33.33%;
                        text-align: center;
                        vertical-align: top;
                }
                .sig-role {
                        font-size: 11px;
                        font-weight: bold;
                }
                .sig-mark-container {
                        height: 55px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 4px 0;
                }
                .signature-qr {
                        width: 50px;
                        height: 50px;
                        object-fit: contain;
                }
                .signature-placeholder {
                        width: 50px;
                        height: 50px;
                }
                .sig-name { font-size: 11px; font-weight: bold; }
                .sig-position { font-size: 11px; font-weight: bold; }
        </style>
</head>
<body>
        <div class="no-print">
                <button onclick="window.print()"> Cetak / Simpan PDF</button>
        </div>

        <div class="print-container">
                <!-- Header Box -->
                <table class="header-table">
                        <tr>
                                <td class="logo-cell" rowspan="4">
                                        <img src="${LOGO_SRC}" alt="Logo INL" class="logo-img">
                                </td>
                                <td class="company-cell" rowspan="2">
                                        <span class="company-title">PT. INDUSTRI NABATI LESTARI</span>
                                        <span class="company-subtitle">PABRIK MINYAK GORENG</span>
                                        <span class="company-address">
                                                Kantor Pusat : Komp. KEK Sei Mangkei, Kav.2-3, Kec. Bosar Maligas,<br>
                                                Kab. Simalungun,<br>
                                                Sumatera Utara, 21184
                                        </span>
                                </td>
                                <td class="meta-title-cell">No. Dokumen</td>
                                <td class="meta-title-cell">Tgl. Berlaku</td>
                        </tr>
                        <tr>
                                <td class="meta-value-cell">INLHO/HRD-F/017</td>
                                <td class="meta-value-cell">12-Nov-18</td>
                        </tr>
                        <tr>
                                <td class="doc-title-cell" rowspan="2">BUSINESS TRIP ORDER (BTO)</td>
                                <td class="meta-title-cell">No. Revisi</td>
                                <td class="meta-title-cell">Halaman</td>
                        </tr>
                        <tr>
                                <td class="meta-value-cell">00</td>
                                <td class="meta-value-cell">1 dari 1</td>
                        </tr>
                </table>

                <!-- Karyawan Box -->
                <div class="content-box">
                        <table class="form-table">
                                <tr>
                                        <td class="col-label">Nama Karyawan</td>
                                        <td class="col-colon">:</td>
                                        <td class="col-value">${esc(btoRow.employeeNama ?? owner?.nama)}</td>
                                </tr>
                                <tr>
                                        <td class="col-label">Jabatan</td>
                                        <td class="col-colon">:</td>
                                        <td class="col-value">${esc(owner?.jabatan || '-')}</td>
                                </tr>
                                <tr>
                                        <td class="col-label">Departemen</td>
                                        <td class="col-colon">:</td>
                                        <td class="col-value">${esc(owner?.unitNama ?? '-')}</td>
                                </tr>
                        </table>
                </div>

                <!-- Detail Box -->
                <div class="content-box">
                        <div class="detail-title">DETAIL</div>
                        <table class="form-table">
                                <tr>
                                        <td class="col-label">Tujuan</td>
                                        <td class="col-colon">:</td>
                                        <td class="col-value">${esc(btoRow.tujuanNama)}</td>
                                </tr>
                                <tr>
                                        <td class="col-label">Keperluan</td>
                                        <td class="col-colon">:</td>
                                        <td class="col-value">${esc(btoRow.kepentingan)}</td>
                                </tr>
                                <tr>
                                        <td class="col-label">Lama Perjalanan</td>
                                        <td class="col-colon">:</td>
                                        <td class="col-value">${dateText(btoRow.estBerangkat)} &nbsp; s/d &nbsp; ${dateText(btoRow.estKembali)}</td>
                                </tr>
                                <tr>
                                        <td class="col-label">Jarak Perjalanan</td>
                                        <td class="col-colon">:</td>
                                        <td class="col-value">${esc(btoRow.jarakKm ? `> ${btoRow.jarakKm} km` : '-')}</td>
                                </tr>
                                <tr>
                                        <td class="col-label">Lama</td>
                                        <td class="col-colon">:</td>
                                        <td class="col-value">${durationDays(btoRow.estBerangkat, btoRow.estKembali)} Hari</td>
                                </tr>
                                <tr>
                                        <td class="col-label">Transport</td>
                                        <td class="col-colon">:</td>
                                        <td class="col-value">${esc(btoRow.transportLabel || '-')}</td>
                                </tr>
                        </table>
                </div>

                <!-- Tanda Tangan Box -->
                <div class="sig-box">
                        <div class="sig-date">Diajukan Tanggal, ${dateText(btoRow.submittedAt || btoRow.createdAt)}</div>
                        <table class="sig-table">
                                <tr>
                                        <td class="sig-role">Pelaksana Tugas</td>
                                        <td class="sig-role">Pemberi Tugas</td>
                                        <td class="sig-role">Diketahui</td>
                                </tr>
                                <tr>
                                        <td><div class="sig-mark-container">${signatureMark(employeeQr)}</div></td>
                                        <td><div class="sig-mark-container">${signatureMark(ptQr)}</div></td>
                                        <td><div class="sig-mark-container">${signatureMark(sdmQr)}</div></td>
                                </tr>
                                <tr>
                                        <td>
                                                <div class="sig-name">${esc(btoRow.employeeNama ?? owner?.nama)}</div>
                                                <div class="sig-position">${esc(formatUnitFull(owner?.unitTipe, owner?.unitNama))}</div>
                                        </td>
                                        <td>
                                                <div class="sig-name">${esc(btoRow.pemberiTugasNama)}</div>
                                                <div class="sig-position">${esc(formatUnitFull(pemberiTugasRow?.unitTipe, pemberiTugasRow?.unitNama))}</div>
                                        </td>
                                        <td>
                                                <div class="sig-name">${esc(sdmName || 'admin-sdm')}</div>
                                                <div class="sig-position">${formatUnitFull(sdmLog?.unitTipe, sdmLog?.unitNama) !== '-' ? esc(formatUnitFull(sdmLog?.unitTipe, sdmLog?.unitNama)) : 'ADM-SDM'}</div>
                                        </td>
                                </tr>
                        </table>
                </div>
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