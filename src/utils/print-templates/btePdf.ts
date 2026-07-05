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
  dpRow: any
) {
  const bteRows = (btoRow.bteRincian || []).map((item: any, idx: number) => {
    const useDollar = Boolean(item.useDollar);
    return `
      <tr class="border border-dark" style="font-size:10px;">
        <td class="border border-dark text-center"></td>
        <td class="border border-dark text-center">X.\${idx + 2}</td>
        <td class="border border-dark" colspan="3" style="padding-left:3%;">\${esc(item.rincianLabel)}</td>
        <td class="border border-dark" style="text-align:right; padding-right:3%;" colspan="2">\${money(item.nilaiTotal, useDollar)}</td>
      </tr>`;
  }).join('');
  
  const bteTotal = (btoRow.bteRincian || []).reduce((acc: number, item: any) => acc + (Number(item.nilaiTotal) || 0), 0);
  const dpTotal = (btoRow.dpRincian || []).reduce((acc: number, item: any) => acc + (Number(item.nilaiTotal) || 0), 0);

  return `
<!DOCTYPE html>
<html>
<head>
        <title>Surat Pengajuan BTE</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.1/dist/css/bootstrap.min.css">
</head>
<body style="margin: -15px -26px 0px 0px;">
        <div style="padding:10px; border:2px solid;">
                <table class="" width="100%">
                        <thead>
                                <tr class="text-center">
                                        <td class="border border-dark" rowspan="4">
                                                <img src="\${LOGO_SRC}" width="83">
                                        </td>
                                        <td class="border border-dark text-center" rowspan="3">
                                                <strong style="text-decoration: underline; font-size:16px;">PT. INDUSTRI NABATI LESTARI</strong><br>
                                                <label style="font-size:12px;">PABRIK MINYAK GORENG</label><br>
                                                <label style="font-size:8px;"><strong>Kantor Pusat:</strong> Komp. KEK Sei Mangkei, Kav.2-3, Kec. Bosar Maligas, Kab. Simalungun, Sumatera Utara, 21184</label>
                                        </td>
                                        <th class="border border-dark">
                                                <strong style="font-size:10px;">No. Dokumen</strong>
                                        </th>
                                        <th class="border border-dark">
                                                <strong style="font-size:10px;">Tgl. Berlaku</strong>
                                        </th>
                                </tr>
                                <tr class="text-center">
                                        <td class="border border-dark">
                                                <label style="font-size:10px;">INLHO/BSIS-GEA/F-014</label>
                                        </td>
                                        <td class="border border-dark">
                                                <label style="font-size:10px;">21-Mar-22</label>
                                        </td>
                                </tr>
                                <tr>
                                        <th class="border border-dark">
                                                <strong style="font-size:10px;">No.Revisi</strong>
                                        </th>
                                        <th class="border border-dark">
                                                <strong style="font-size:10px;">Halaman</strong>
                                        </th>
                                </tr>
                                <tr class="text-center">
                                        <th class="border border-dark">
                                                <strong style="font-size:14px;">DETAIL OF BUSINESS TRIP EXPENSES (BTE)</strong>
                                        </th>
                                        <td class="border border-dark">
                                                <label style="font-size:10px;">01</label>
                                        </td>
                                        <td class="border border-dark">
                                                <label style="font-size:10px;">1 dari 1</label>
                                        </td>
                                </tr>
                        </thead>
                </table>
                <table class="mt-3" width="100%">
                        <tbody>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center" width="4%">I</td>
                                        <td style="font-style: italic;" width="15%" colspan="3"><strong>SPJ/BTO NUMBER</strong></td>
                                        <td colspan="4">: &nbsp; \${!btoRow.nomorBto ? 'SURAT BELUM DI TERBITKAN' : btoRow.nomorBto}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">II</td>
                                        <td style="font-style: italic;" colspan="3"><strong>NAME</strong></td>
                                        <td colspan="4">: &nbsp; \${esc((btoRow.employeeNama ?? owner?.nama) || '').toUpperCase()}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">III</td>
                                        <td style="font-style: italic;" colspan="3"><strong>POSITION</strong></td>
                                        <td colspan="4">: &nbsp; \${owner?.gradeKode === 'Direktur Utama' ? 'DIREKTUR' : esc((owner?.gradeKode || '')).toUpperCase()}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">IV</td>
                                        <td style="font-style: italic;" colspan="3"><strong>JOB LEVEL</strong></td>
                                        <td colspan="4">: &nbsp; \${owner?.gradeLevel}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">V</td>
                                        <td style="font-style: italic;" colspan="3"><strong>DIVISION</strong></td>
                                        <td colspan="4">: &nbsp; \${esc((owner?.unitNama || '')).toUpperCase()}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">VI</td>
                                        <td style="font-style: italic;" colspan="3"><strong>DEPARTMENT</strong></td>
                                        <td colspan="4">: &nbsp; \${esc((owner?.unitNama || '')).toUpperCase()}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">VII</td>
                                        <td style="font-style: italic;" colspan="3"><strong>DESTINATION</strong></td>
                                        <td colspan="4">: &nbsp; \${esc(btoRow.tujuanNama).toUpperCase()}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">VIII</td>
                                        <td style="font-style: italic;" colspan="3"><strong>PERIODE</strong></td>
                                        <td colspan="4"></td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center" rowspan="2"></td>
                                        <td class="border border-dark text-center" width="4%">VIII.1</td>
                                        <td style="font-style: italic;" colspan="2"><strong>START</strong></td>
                                        <td colspan="4">: &nbsp; \${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">VIII.2</td>
                                        <td style="font-style: italic;" colspan="2"><strong>END</strong></td>
                                        <td colspan="4">: &nbsp; \${dateText(btoRow.estKembali).toUpperCase()}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">IX</td>
                                        <td style="font-style: italic;" colspan="3"><strong>DESCRIPTION OF SCHEDULE</strong></td>
                                        <td colspan="4"></td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center" rowspan="4"></td>
                                        <td class="border border-dark text-center" width="5%">IX.1</td>
                                        <td style="font-style: italic;" colspan="2"><strong>DEPARTURE DATE</strong></td>
                                        <td colspan="4">: &nbsp; \${dateText(btoRow.estBerangkat).toUpperCase()}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">IX.2</td>
                                        <td style="font-style: italic;" colspan="2"><strong>DEPARTURE TIME</strong></td>
                                        <td colspan="4">: &nbsp; \${btoRow.estBerangkat ? new Date(btoRow.estBerangkat).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">IX.3</td>
                                        <td style="font-style: italic;" colspan="2"><strong>ARRIVAL DATE</strong></td>
                                        <td colspan="4">: &nbsp; \${dateText(btoRow.estKembali).toUpperCase()}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">IX.4</td>
                                        <td style="font-style: italic;" colspan="2"><strong>ARRIVAL TIME</strong></td>
                                        <td colspan="4">: &nbsp; \${btoRow.estKembali ? new Date(btoRow.estKembali).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X</td>
                                        <td style="font-style: italic;" colspan="3"><strong>DETAIL OF TRAVEL EXPENSES</strong></td>
                                        <td colspan="4"></td>
                                </tr>
                                \${bteRows}
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center" style="font-style: italic;" colspan="6"><strong>TOTAL EXPENSES</strong></td>
                                        <td class="border border-dark" style="text-align:right; padding-right:5%;font-weight:bold">\${money(bteTotal, false)}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center" style="font-style: italic;" colspan="6"><strong>DOWN PAYMENT</strong></td>
                                        <td class="border border-dark" style="text-align:right; padding-right:5%;font-weight:bold">\${money(dpTotal, false)}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center" style="font-style: italic;" colspan="6"><strong>FINAL</strong></td>
                                        <td class="border border-dark" style="text-align:right; padding-right:5%;font-weight:bold">\${money(Math.abs(bteTotal - dpTotal), false)} (\${bteTotal >= dpTotal ? 'Kekurangan' : 'Kelebihan'})</td>
                                </tr>
                        </tbody>
                </table>
                <table width="100%" class="mt-5">
                        <thead>
                                <tr>
                                        <td width="60%">
                                                <label style="font-size:11px;"></label>
                                        </td>
                                        <td class="text-center">
                                                <label style="font-size:11px;">Sign by Personalia: <strong style="font-style:italic;">GA Administrator</strong></label>
                                        </td>
                                </tr>
                        </thead>
                </table>
        </div>
</body>
</html>
`;
}
