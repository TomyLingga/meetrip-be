export function bteLuarNegeriPrintTemplate(data: any) {
        const { btoRow, owner, ptRow, bteRow, dpRow, logs, LOGO_SRC, esc, dateText, durationDays, money, adminQr } = data;

        const departureTime = btoRow.estBerangkat ? new Date(btoRow.estBerangkat).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace('.', ':') : '07:00';
        const arrivalTime = btoRow.estKembali ? new Date(btoRow.estKembali).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace('.', ':') : '23:00';

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

        // Helper to match database rincian items to their corresponding layout category
        const isBteDollar = (bteRow?.bteRincian || []).some((r: any) => r.useDollar);

        const rincianList = bteRow?.bteRincian || [];
        const formatKategoriName = (kat: string) => {
                const k = kat ? kat.toLowerCase() : '';
                switch (k) {
                        case 'saku': return 'POCKET MONEY / UANG SAKU';
                        case 'hotel': return 'HOTEL / ACCOMMODATION';
                        case 'laundry': return 'LAUNDRY';
                        case 'transport': return 'TRANSPORTATION / TICKET';
                        case 'meal': return 'MEAL ALLOWANCE / UANG MAKAN';
                        case 'lain_lain':
                        case 'lain-lain':
                        case 'others':
                                return 'OTHERS / BIAYA LAIN';
                        default:
                                return kat ? kat.replace(/_/g, ' ').toUpperCase() : 'OTHERS / BIAYA LAIN';
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

        let dynamicDetailHtml = '';
        let catIndex = 1;
        for (const [kategori, items] of Object.entries(groupedRincian)) {
                let itemsHtml = '';
                (items as any[]).forEach(item => {
                        const valStr = money(item.nilaiTotal, item.useDollar || isBteDollar);
                        itemsHtml += `
                        <tr style="font-size: 10px;">
                                <td></td>
                                <td></td>
                                <td colspan="3" style="padding-left: 15px; font-weight: normal;">- ${esc(item.rincianLabel || '-')}</td>
                                <td class="text-right" colspan="2">${valStr}</td>
                        </tr>
                        `;
                });

                dynamicDetailHtml += `
                <tr style="font-size: 10px;">
                        <td></td>
                        <td style="padding-left: 20px; font-weight: bold;" width="5%">X.1.${catIndex}</td>
                        <td colspan="3" style="font-weight: bold;">${formatKategoriName(kategori)}</td>
                        <td colspan="2"></td>
                </tr>
                ${itemsHtml}
                `;
                catIndex++;
        }

        // Calculate totals (with dollar formatting flag if applicable)
        const dpTotal = dpRow ? Number(isBteDollar ? (dpRow.totalUsd || 0) : (dpRow.totalIdr || 0)) : 0;
        const bteTotal = Number(isBteDollar ? (bteRow?.totalUsd || 0) : (bteRow?.totalIdr || 0));
        const finalTotal = bteTotal - dpTotal;

        // Render Custom Cost Items
        const etcRows = (bteRow?.bteBiayaLain || []).map((item: any, idx: number) => {
                return `
      <tr style="font-size:10px;">
        <td class="border border-dark text-center"></td>
        <td class="border border-dark text-center">X.2.${idx + 1}</td>
        <td class="border border-dark" colspan="3" style="padding-left:3%; text-transform: uppercase;">${esc(item.keterangan)}</td>
        <td class="border border-dark text-right" style="padding-right:3%;" colspan="2">${money(item.nilai, item.useDollar || isBteDollar)}</td>
      </tr>`;
        }).join('');

        return `
<!DOCTYPE html>
<html>
<head>
        <title>Detail of Business Trip Expenses (BTE) Abroad</title>
        <style type="text/css">
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
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
                        margin-bottom: 6px;
                }
                .header-table td, .header-table th {
                        border: 1px solid #000;
                        padding: 2px 4px;
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
                        border-collapse: collapse;
                        margin-top: 8px;
                }
                .content-table td {
                        border: 1px solid black;
                        padding: 2px 4px;
                        vertical-align: top;
                }
                .text-right {
                        text-align: right;
                }
                .text-center {
                        text-align: center;
                }
                .footer-table {
                        width: 100%;
                        margin-top: 12px;
                }
                .address-footer {
                        width: 100%;
                        margin-top: 10px;
                        font-size: 8px;
                        color: #555;
                        line-height: 1.25;
                        border-top: 1px solid #ddd;
                        padding: 6px 12px 0;
                        text-align: center;
                }
                .no-print { margin: 0 auto 10px; text-align: right; }
                .no-print button { padding: 6px 10px; border: 1px solid #0f766e; border-radius: 4px; background: #0f766e; color: white; font-weight: 700; cursor: pointer; }
                @media print {
                        .no-print {
                                display: none;
                        }
                        body {
                                padding-left: 6mm;
                                padding-right: 6mm;
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
                                <th class="doc-title-cell">DETAIL OF BUSINESS TRIP EXPENSES (BTE) ABROAD</th>
                                <td class="meta-value-cell">01</td>
                                <td class="meta-value-cell">1 dari 1</td>
                        </tr>
                </thead>
        </table>

        <!-- Content Table -->
        <table class="content-table">
                <tr>
                        <td width="5%" align="center">I</td>
                        <td width="30%" class="bold" style="font-style: italic;">SPDK/BTO NUMBER</td>
                        <td colspan="5">: &nbsp; ${esc(btoRow.nomorBto || 'SURAT BELUM DITERBITKAN')}</td>
                </tr>
                <tr>
                        <td align="center">II</td>
                        <td class="bold" style="font-style: italic;">NAME</td>
                        <td colspan="5">: &nbsp; ${esc((btoRow.employeeNama || owner?.nama || '').toUpperCase())}</td>
                </tr>
                <tr>
                        <td align="center">III</td>
                        <td class="bold" style="font-style: italic;">POSITION</td>
                        <td colspan="5">: &nbsp; ${esc((owner?.jabatan || owner?.gradeKode || '').toUpperCase())}</td>
                </tr>
                <tr>
                        <td align="center">IV</td>
                        <td class="bold" style="font-style: italic;">JOB LEVEL</td>
                        <td colspan="5">: &nbsp; ${jobLevelName(owner?.gradeLevel)}</td>
                </tr>
                <tr>
                        <td align="center">V</td>
                        <td class="bold" style="font-style: italic;">DESTINATION</td>
                        <td colspan="5">: &nbsp; ${esc(btoRow.tujuanNama).toUpperCase()}</td>
                </tr>
                <tr>
                        <td align="center">VI</td>
                        <td class="bold" style="font-style: italic;">NECESSARY</td>
                        <td colspan="5">: &nbsp; ${esc(btoRow.kepentingan).toUpperCase()}</td>
                </tr>
                <tr>
                        <td align="center">VII</td>
                        <td class="bold" style="font-style: italic;">TOTAL DAYS</td>
                        <td colspan="5">: &nbsp; ${durationDays(btoRow.estBerangkat, btoRow.estKembali)} HARI</td>
                </tr>
                <tr>
                        <td align="center">VIII</td>
                        <td class="bold" style="font-style: italic;" colspan="6">PERIODE</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">VIII.1 START</td>
                        <td colspan="5">: &nbsp; ${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">VIII.2 END</td>
                        <td colspan="5">: &nbsp; ${dateText(btoRow.estKembali).toUpperCase()}</td>
                </tr>
                <tr>
                        <td align="center">IX</td>
                        <td class="bold" style="font-style: italic;" colspan="6">DESCRIPTION OF SCHEDULE</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">IX.1 DEPARTURE DATE</td>
                        <td colspan="5">: &nbsp; ${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">IX.2 DEPARTURE TIME</td>
                        <td colspan="5">: &nbsp; ${departureTime}</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">IX.3 ARRIVAL DATE</td>
                        <td colspan="5">: &nbsp; ${dateText(btoRow.estKembali).toUpperCase()}</td>
                </tr>
                <tr>
                        <td></td>
                        <td style="font-style: italic; padding-left: 20px;">IX.4 ARRIVAL TIME</td>
                        <td colspan="5">: &nbsp; ${arrivalTime}</td>
                </tr>
                <tr>
                        <td align="center">X</td>
                        <td class="bold" style="font-style: italic;" colspan="6">DETAIL OF TRAVEL EXPENSES</td>
                </tr>
                <tr>
                        <td></td>
                        <td class="bold" style="font-style: italic;" colspan="6">X.1 OUTSIDE OF THE REGION</td>
                </tr>
                <tr class="bold text-center" style="font-size: 10px;">
                        <td></td>
                        <td colspan="4">Expenditure</td>
                        <td colspan="2">Total Price</td>
                </tr>
                ${dynamicDetailHtml}
                <tr class="bold" style="font-size: 10px;">
                        <td></td>
                        <td style="font-style: italic;" colspan="6">X.2 ETC</td>
                </tr>
                ${etcRows}
                <tr class="bold" style="font-size: 11px;">
                        <td colspan="5" align="right" style="padding-right: 15px; font-style: italic;">TOTAL EXPENSES</td>
                        <td class="text-right" colspan="2">${money(bteTotal, isBteDollar)}</td>
                </tr>
                <tr class="bold" style="font-size: 11px;">
                        <td colspan="5" align="right" style="padding-right: 15px; font-style: italic;">DOWN PAYMENT</td>
                        <td class="text-right" colspan="2">${money(dpTotal, isBteDollar)}</td>
                </tr>
                <tr class="bold" style="font-size: 11px;">
                        <td colspan="5" align="right" style="padding-right: 15px; font-style: italic;">
                                ${finalTotal < 0 ? 'FINAL (OVERPAID / REFUND TO COMPANY)' : finalTotal > 0 ? 'FINAL (UNDERPAID / REIMBURSE TO EMPLOYEE)' : 'FINAL'}
                        </td>
                        <td class="text-right" colspan="2">${money(finalTotal < 0 ? Math.abs(finalTotal) : finalTotal, isBteDollar)}</td>
                </tr>
        </table>

        <!-- Footer Sign Personalia / Reviewer -->
        <table class="footer-table" border="0" cellspacing="0" cellpadding="0" style="margin-top: 20px;">
                <tr>
                        <td width="60%"></td>
                        <td align="center" style="font-size: 11px;">
                                <p style="margin-bottom: 5px;"><b>Reviewed & Approved by SDM / Admin:</b></p>
                                ${adminQr ? `
                                <img src="${adminQr}" style="width: 65px; height: 65px; object-fit: contain; margin-bottom: 5px;" />
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
                let printTriggered = false;

                window.addEventListener('load', () => {
                setTimeout(() => {
                printTriggered = true;
                window.print();
                }, 500);
                });

                window.addEventListener('afterprint', () => {
                if (!printTriggered) return;

                setTimeout(() => {
                if (window.opener) {
                        window.close();
                } else if (document.referrer) {
                        window.location.href = document.referrer;
                } else {
                        history.back();
                }
                        }, 300);
                });
        </script>
</body>
</html>
`;
}
