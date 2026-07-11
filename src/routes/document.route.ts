import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, desc, eq, or } from 'drizzle-orm'
import QRCode from 'qrcode'
import fs from 'fs'
import path from 'path'
import { db } from '../db/connection'
import {
  attendStamp,
  bte as bteTable,
  bteApprovalLog,
  bto,
  btoApprovalLog,
  dp as dpTable,
  dpApprovalLog,
  localUserCache,
  spdk as spdkTable,
  spdkApprovalLog,
  refTransport,
  refRincianBiaya,
} from '../db/schema'
import { AppError } from '../utils/errorHandler'
import { config } from '../config/env'
import { btoPrintTemplate } from '../utils/print-templates/btoPdf'
import { spdkPrintTemplate } from '../utils/print-templates/spdkPdf'
import { panjarPrintTemplate } from '../utils/print-templates/panjarPdf'
import { panjarLuarNegeriPrintTemplate } from '../utils/print-templates/panjarLuarNegeriPdf'
import { btePrintTemplate } from '../utils/print-templates/btePdf'
import { bteLuarNegeriPrintTemplate } from '../utils/print-templates/bteLuarNegeriPdf'
import { ensureApproverSpdkConfig, resolveSpdkApproverKabag } from '../services/spdk.service'
import { listBtoApprovalsService, listBtoApprovalsHistoryService } from '../services/bto.service'

const paramsSchema = z.object({
  btoId: z.string().uuid(),
})

type BtoRow = typeof bto.$inferSelect
type BtoLog = typeof btoApprovalLog.$inferSelect
type DpLog = typeof dpApprovalLog.$inferSelect
type SpdkLog = typeof spdkApprovalLog.$inferSelect
type BteLog = typeof bteApprovalLog.$inferSelect
type AttendStampRow = typeof attendStamp.$inferSelect

let LOGO_SRC = ''
let LOGO_RIGHT_SRC = ''
try {
  const logoPath = path.join(process.cwd(), 'uploads', 'documents', 'inl.png')
  const logoBase64 = fs.readFileSync(logoPath).toString('base64')
  LOGO_SRC = `data:image/png;base64,${logoBase64}`
} catch (e) {
  LOGO_SRC = ''
}

try {
  const logoRightPath = path.join(process.cwd(), 'contoh', 'logo_INL_right.png')
  const logoRightBase64 = fs.readFileSync(logoRightPath).toString('base64')
  LOGO_RIGHT_SRC = `data:image/png;base64,${logoRightBase64}`
} catch (e) {
  LOGO_RIGHT_SRC = ''
}

const monthFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
})

function esc(value: unknown) {
  return String(value ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function dateText(value: unknown) {
  if (!value) return '-'
  const d = new Date(value as string | Date)
  return Number.isNaN(d.getTime()) ? '-' : monthFormatter.format(d)
}

function dateTimeText(value: unknown) {
  if (!value) return '-'
  const d = new Date(value as string | Date)
  return Number.isNaN(d.getTime()) ? '-' : `${dateTimeFormatter.format(d)} WIB`
}

function isoText(value: unknown) {
  if (!value) return null
  const d = new Date(value as string | Date)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function money(value: unknown, useDollar = false) {
  const n = Number(value || 0)
  if (useDollar) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`
}

function durationDays(start: unknown, end: unknown) {
  const a = new Date(start as string | Date)
  const b = new Date(end as string | Date)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  const startD = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const endD = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.max(1, Math.floor((endD.getTime() - startD.getTime()) / 86400000) + 1)
}

async function qrDataUrl(payload: Record<string, unknown> | null) {
  if (!payload) return null
  return QRCode.toDataURL(JSON.stringify(payload), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 300,
  })
}

async function qrTextDataUrl(text: string | null) {
  if (!text) return null
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 300,
  })
}

async function fetchPortalEmployee(employeeId?: string | null) {
  if (!employeeId) return null
  try {
    const res = await fetch(`${config.portal.apiUrl}/api/sso/employees?id=${employeeId}`, {
      headers: { 'x-internal': config.portal.internalToken },
    })
    if (!res.ok) return null
    const body: any = await res.json()
    const data = Array.isArray(body?.data) ? body.data[0] : body?.data
    return data || null
  } catch {
    return null
  }
}

function pickLog<T extends { aksi: string; tahap?: string | null }>(
  logs: T[],
  predicate: (log: T) => boolean,
) {
  return logs.find(predicate) ?? null
}

function approvalPayload(
  documentType: string,
  role: string,
  btoRow: BtoRow,
  log: { aksi: string; actorId: string; actorNama: string | null; createdAt: Date | null } | null,
) {
  if (!log) return null
  return {
    document: documentType,
    nomorBto: btoRow.nomorBto,
    role,
    action: log.aksi,
    approvedBy: log.actorNama,
    approverId: log.actorId,
    timestamp: isoText(log.createdAt),
  }
}

async function approvalSlot(
  label: string,
  documentType: string,
  role: string,
  btoRow: BtoRow,
  log: { aksi: string; actorId: string; actorNama: string | null; createdAt: Date | null } | null,
  fallbackName = '',
) {
  const qrUrl = await qrDataUrl(approvalPayload(documentType, role, btoRow, log))
  const name = log?.actorNama || fallbackName
  const timestamp = log?.createdAt ? dateTimeText(log.createdAt) : ''
  return signatureSlot(label, name, timestamp, qrUrl)
}

function signatureSlot(label: string, name?: string | null, timestamp?: string | null, qrUrl?: string | null) {
  const hasQr = Boolean(qrUrl)
  return `<div class="signature-cell">
    <p class="sig-label">${esc(label)}</p>
    <div class="qr-box">
      ${hasQr ? `<img src="${esc(qrUrl)}" alt="QR ${esc(label)}" />` : '<span class="qr-empty">QR</span>'}
    </div>
    <b>( ${esc(name || '____________________')} )</b>
    ${timestamp ? `<small>${esc(timestamp)}</small>` : '<small>&nbsp;</small>'}
  </div>`
}

function signatureSection(slots: string[]) {
  return `<section class="signatures">${slots.join('')}</section>`
}

function documentShell(title: string, docTitle: string, body: string, code = 'MT-FRM') {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.35; }
    .page { max-width: 780px; margin: 0 auto; }
    .header-table, .meta-table, .items, .info-box { width: 100%; border-collapse: collapse; }
    .header-table { border: 2px solid #111; }
    .header-table td { border: 1px solid #111; vertical-align: middle; }
    .logo-cell { width: 116px; text-align: center; padding: 7px; }
    .doc-logo { width: 94px; height: 58px; object-fit: contain; display: inline-block; }
    .company-cell { text-align: center; padding: 8px 10px; }
    .company-cell h1 { margin: 0 0 3px; font-size: 15px; letter-spacing: 0; text-decoration: underline; }
    .company-cell p { margin: 1px 0; font-size: 9.5px; font-weight: 700; }
    .meta-cell { width: 166px; padding: 0; }
    .meta-table td { border: 0; border-bottom: 1px solid #111; padding: 4px 6px; font-size: 9px; }
    .meta-table tr:last-child td { border-bottom: 0; }
    .document-title { text-align: center; margin: 14px 0 10px; }
    .document-title h2 { margin: 0; font-size: 14px; text-decoration: underline; }
    .document-title p { margin: 3px 0 0; font-weight: 700; }
    .box { border: 1px solid #111; padding: 9px 10px; margin-top: 9px; page-break-inside: avoid; }
    .section-title { font-weight: 800; margin: 0 0 7px; text-transform: uppercase; }
    .info { width: 100%; border-collapse: collapse; }
    .info td { padding: 3px 4px; vertical-align: top; }
    .items th, .items td { border: 1px solid #111; padding: 5px 6px; vertical-align: top; }
    .items th { background: #f3f4f6; text-align: left; }
    .items tfoot th { background: #fff; }
    .signatures { margin-top: 18px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center; page-break-inside: avoid; }
    .signature-cell { min-height: 162px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
    .sig-label { margin: 0 0 6px; font-weight: 700; }
    .qr-box { width: 92px; height: 92px; border: 1px solid #111; display: flex; align-items: center; justify-content: center; margin-bottom: 5px; background: #fff; }
    .qr-box img { width: 86px; height: 86px; object-fit: contain; display: block; }
    .qr-empty { color: #9ca3af; font-size: 10px; font-weight: 700; }
    .signature-cell b { font-size: 10px; }
    .signature-cell small { margin-top: 2px; font-size: 8.5px; color: #374151; }
    .muted { color: #4b5563; }
    .right { text-align: right; }
    .center { text-align: center; }
    ul { margin: 4px 0 0 18px; padding: 0; }
    li { margin: 2px 0; }
    .no-print { margin: 0 auto 10px; max-width: 780px; text-align: right; }
    .no-print button { padding: 8px 12px; border: 1px solid #0f766e; border-radius: 4px; background: #0f766e; color: white; font-weight: 700; cursor: pointer; }
    @media print { .no-print { display: none; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
  <main class="page">
    <table class="header-table">
      <tr>
        <td class="logo-cell"><img class="doc-logo" src="${esc(LOGO_SRC)}" alt="Logo INL" /></td>
        <td class="company-cell">
          <h1>PT. INDUSTRI NABATI LESTARI</h1>
          <p>PABRIK MINYAK GORENG</p>
          <p>Komp. KEK Sei Mangkei, Kav. 2-3, Kab. Simalungun, Sumatera Utara</p>
        </td>
        <td class="meta-cell">
          <table class="meta-table">
            <tr><td><b>No. Dokumen</b><br/>${esc(code)}</td></tr>
            <tr><td><b>Tgl. Berlaku</b><br/>${dateText(new Date())}</td></tr>
            <tr><td><b>Revisi</b><br/>00</td></tr>
            <tr><td><b>Halaman</b><br/>1 dari 1</td></tr>
          </table>
        </td>
      </tr>
    </table>
    <section class="document-title">
      <h2>${esc(docTitle)}</h2>
    </section>
    ${body}
  </main>
</body>
</html>`
}

function employeeSection(btoRow: BtoRow, owner: any) {
  return `<table class="info">
    <tr><td width="29%">Nama Karyawan</td><td width="2%">:</td><td>${esc(btoRow.employeeNama ?? owner?.nama)}</td></tr>
    <tr><td>Jabatan / Grade</td><td>:</td><td>${esc(owner?.gradeKode ?? '-')}</td></tr>
    <tr><td>Departemen / Unit</td><td>:</td><td>${esc(owner?.unitNama ?? '-')}</td></tr>
    <tr><td>Pemberi Tugas</td><td>:</td><td>${esc(btoRow.pemberiTugasNama)}</td></tr>
  </table>`
}

function tripSection(btoRow: BtoRow) {
  return `<table class="info">
    <tr><td width="29%">Tujuan</td><td width="2%">:</td><td>${esc(btoRow.tujuanNama)}</td></tr>
    <tr><td>Alamat</td><td>:</td><td>${esc(btoRow.tujuanAlamat)}</td></tr>
    <tr><td>Keperluan</td><td>:</td><td>${esc(btoRow.kepentingan)}</td></tr>
    <tr><td>Lama Perjalanan</td><td>:</td><td>${dateText(btoRow.estBerangkat)} s/d ${dateText(btoRow.estKembali)}</td></tr>
    <tr><td>Jumlah Hari</td><td>:</td><td>${durationDays(btoRow.estBerangkat, btoRow.estKembali)} hari</td></tr>
    <tr><td>Transportasi</td><td>:</td><td>${esc(btoRow.transportLabel)}</td></tr>
    <tr><td>Barang Bawaan</td><td>:</td><td>${esc(btoRow.barang)}</td></tr>
  </table>`
}

async function renderBto(btoRow: BtoRow, owner: any, logs: BtoLog[]) {
  const sdmLog = ['SPDK_DRAFT', 'KABAG_REVIEW', 'ACTIVE', 'ATTENDED', 'REPORT_UPLOADED', 'BTE_DRAFT', 'ADMIN_BTE_REVIEW', 'REVISION_BTE', 'BTE_PAYMENT', 'COMPLETED', 'PAID'].includes(btoRow.status)
    ? (pickLog(logs, (log) => log.tahap === 'sdm' && log.aksi === 'approve') || pickLog(logs, (log) => log.tahap === 'admin_dp' && log.aksi === 'approve'))
    : null
  const ptLog = pickLog(logs, (log) => log.tahap === 'pemberi_tugas' && log.aksi === 'approve')
  
  let ptRow = null
  if (btoRow.pemberiTugasId) {
    const cachedByPortal = await db.select().from(localUserCache).where(eq(localUserCache.portalUserId, btoRow.pemberiTugasId)).limit(1)
    const cachedByEmployee = cachedByPortal[0] ? [] : await db.select().from(localUserCache).where(eq(localUserCache.employeeId, btoRow.pemberiTugasId)).limit(1)
    ptRow = cachedByPortal[0] || cachedByEmployee[0] || null
    const ptEmployee = await fetchPortalEmployee(ptRow?.employeeId || btoRow.pemberiTugasId)
    if (ptEmployee) {
      ptRow = {
        ...ptRow,
        jabatan: ptEmployee.jabatan ?? null,
        gradeKode: ptEmployee.gradeKode ?? ptEmployee.grade?.kode ?? ptRow?.gradeKode,
        unitNama: ptEmployee.unitNama ?? ptEmployee.organisasi?.nama ?? ptRow?.unitNama,
        unitTipe: ptEmployee.unitTipe ?? ptEmployee.organisasi?.tipe ?? (ptRow as any)?.unitTipe ?? null,
      }
    }
  }
  
  const sdmName = sdmLog ? sdmLog.actorNama : ''

  // Generate QR Codes
  const employeeQrText = `Pelaksana: ${btoRow.employeeNama ?? owner?.nama}\nTanggal: ${dateTimeText(btoRow.createdAt)}`
  const employeeQr = await qrTextDataUrl(employeeQrText)

  let ptQr = null
  if (ptLog && (btoRow.status !== 'DRAFT' && btoRow.status !== 'REVISION_DP' && btoRow.status !== 'PT_REVIEW')) {
    const ptQrText = `Disetujui Pemberi Tugas: ${btoRow.pemberiTugasNama}\nTanggal: ${dateTimeText(ptLog.createdAt)}`
    ptQr = await qrTextDataUrl(ptQrText)
  }

  let sdmQr = null
  if (sdmLog) {
    const sdmQrText = `Diketahui SDM: ${sdmLog.actorNama}\nTanggal: ${dateTimeText(sdmLog.createdAt)}`
    sdmQr = await qrTextDataUrl(sdmQrText)
  }

  return btoPrintTemplate(btoRow, owner, ptRow, sdmLog, sdmName || '', LOGO_SRC, esc, dateText, durationDays, employeeQr, ptQr, sdmQr)
}

async function renderSpdk(
  btoRow: BtoRow,
  owner: any,
  spdkRow: typeof spdkTable.$inferSelect,
  logs: SpdkLog[],
  stamp: AttendStampRow | null,
) {
  const isApproved = logs.some((log) => log.aksi === 'approve')
  const kabagLog = pickLog(logs, (log) => log.aksi === 'approve')
  
  let kabagNama = spdkRow.approverKabagNama
  let kabagPosition = 'Kabag SDM & Sistem'

  try {
    const cfg = await ensureApproverSpdkConfig()
    const resolvedKabag = await resolveSpdkApproverKabag(btoRow, cfg)
    const kabagId = spdkRow.approverKabagId || resolvedKabag.id
    if (kabagId) {
      const cached = await db.query.localUserCache.findFirst({
        where: or(eq(localUserCache.portalUserId, kabagId), eq(localUserCache.employeeId, kabagId))
      })
      const portalEmp = await fetchPortalEmployee(cached?.employeeId || kabagId)
      if (portalEmp) {
        kabagNama = portalEmp.namaLengkap || cached?.nama || kabagNama
        const unitTipe = portalEmp.unitTipe ?? ''
        const unitNama = portalEmp.unitNama ?? ''
        let unitTitle = ''
        if (unitTipe && unitNama) {
          if (unitTipe.toLowerCase().startsWith('direktorat')) {
            unitTitle = `Direktur ${unitNama}`
          } else if (unitTipe.toLowerCase().startsWith('bagian')) {
            unitTitle = `Kepala Bagian ${unitNama}`
          } else {
            unitTitle = `Kepala ${unitTipe} ${unitNama}`
          }
        } else {
          unitTitle = portalEmp.jabatan || cached?.unitNama || kabagPosition
        }
        kabagPosition = unitTitle
      } else if (cached) {
        kabagNama = cached.nama || kabagNama
        kabagPosition = cached.unitNama || kabagPosition
      }
    }
  } catch (err) {
    console.error('Failed resolving Kabag details for SPDK print', err)
  }

  let kabagQr = null
  if (kabagLog && isApproved) {
    const kabagQrText = `Disetujui ${kabagPosition}: ${kabagNama}\nTanggal: ${dateTimeText(kabagLog.createdAt || spdkRow.createdAt)}`
    kabagQr = await qrTextDataUrl(kabagQrText)
  }

  let destinationQr = null
  if (stamp) {
    const stampDate = stamp.stamped_at ? stamp.stamped_at : new Date()
    const destinationQrText = `Dokumen: SPDK\nKaryawan: ${btoRow.employeeNama ?? owner?.nama ?? '-'}\nLokasi Tujuan: ${btoRow.tujuanNama ?? '-'}\nKoordinat Tujuan: ${btoRow.tujuanLat ?? '-'}, ${btoRow.tujuanLng ?? '-'}\nKoordinat Absen: ${stamp.stampLat ?? '-'}, ${stamp.stampLng ?? '-'}\nWaktu Absen: ${dateTimeText(stampDate)}`
    destinationQr = await qrTextDataUrl(destinationQrText)
  }

  const printSpdkRow = {
    ...spdkRow,
    approverKabagNama: kabagNama,
    approverKabagPosition: kabagPosition,
  }

  return spdkPrintTemplate(btoRow, owner, printSpdkRow, logs, stamp, LOGO_RIGHT_SRC, esc, dateText, durationDays, kabagQr, destinationQr)
}

async function renderDp(btoRow: BtoRow, owner: any, dpRow: any, logs: DpLog[]) {
  const ptLog = await db.query.btoApprovalLog.findFirst({
    where: and(
      eq(btoApprovalLog.btoId, btoRow.id),
      eq(btoApprovalLog.tahap, 'pemberi_tugas'),
      eq(btoApprovalLog.aksi, 'approve'),
    ),
    orderBy: [desc(btoApprovalLog.createdAt)],
  })

  let ptRow = null
  if (btoRow.pemberiTugasId) {
    const cached = await db.select().from(localUserCache).where(eq(localUserCache.id, btoRow.pemberiTugasId)).limit(1)
    ptRow = cached[0] || null
  }

  // Generate QR for Finance approval of DP (from btoApprovalLog table where tahap === 'admin_dp')
  const financeLog = await db.query.btoApprovalLog.findFirst({
    where: and(
      eq(btoApprovalLog.btoId, btoRow.id),
      eq(btoApprovalLog.tahap, 'admin_dp'),
      eq(btoApprovalLog.aksi, 'approve'),
    ),
    orderBy: [desc(btoApprovalLog.createdAt)],
  })

  let financeQr = null
  if (financeLog && btoRow.status !== 'ADMIN_DP_REVIEW') {
    const financeQrText = `Disetujui Keuangan: ${financeLog.actorNama}\nTanggal: ${dateTimeText(financeLog.createdAt)}`
    financeQr = await qrTextDataUrl(financeQrText)
  }

  // Update dpRincian with the latest kategori from ref_rincian_biaya
  if (dpRow && Array.isArray(dpRow.dpRincian)) {
    const allRefRincian = await db.select().from(refRincianBiaya);
    const rincianMap = new Map(allRefRincian.map(r => [r.id, r]));
    dpRow.dpRincian = dpRow.dpRincian.map((item: any) => {
      const ref = rincianMap.get(item.rincianId);
      return {
        ...item,
        kategori: ref?.kategori || item.kategori,
      };
    });
  }

  const spdkRow = await db.query.spdk.findFirst({ where: eq(spdkTable.btoId, btoRow.id) })
  const printBtoRow = spdkRow?.nomorSpdk ? { ...btoRow, nomorBto: spdkRow.nomorSpdk } : btoRow

  if (btoRow.wilayahTipe === 'luar_negeri') {
    return panjarLuarNegeriPrintTemplate({
      btoRow: printBtoRow,
      owner,
      ptRow,
      dpRow: { ...dpRow, dpRincian: (dpRow as any)?.dpRincian ?? [] },
      logs,
      LOGO_SRC,
      esc,
      dateText,
      durationDays,
      money,
      financeQr,
    })
  }
  return panjarPrintTemplate(printBtoRow, owner, ptRow, logs, LOGO_SRC, esc, dateText, durationDays, money, dpRow, financeQr)
}

async function renderBte(btoRow: BtoRow, owner: any, bteRow: any, logs: BteLog[]) {
  const ptLog = await db.query.btoApprovalLog.findFirst({
    where: and(
      eq(btoApprovalLog.btoId, btoRow.id),
      eq(btoApprovalLog.tahap, 'pemberi_tugas'),
      eq(btoApprovalLog.aksi, 'approve'),
    ),
    orderBy: [desc(btoApprovalLog.createdAt)],
  })

  let ptRow = null
  if (btoRow.pemberiTugasId) {
    const cached = await db.select().from(localUserCache).where(eq(localUserCache.id, btoRow.pemberiTugasId)).limit(1)
    ptRow = cached[0] || null
  }

  // Get dpRow if it exists, to support down payment comparison in BTE
  let dpRow = null;
  if (btoRow.id) {
    const dpList = await db.select().from(dpTable).where(eq(dpTable.btoId, btoRow.id)).limit(1);
    dpRow = dpList[0] || null;
  }

  // Generate QR for Admin/SDM approval of BTE
  const adminLog = pickLog(logs, (log) => log.aksi === 'approve')
  let adminQr = null
  if (adminLog && bteRow.status !== 'ADMIN_REVIEW') {
    const adminQrText = `Disetujui BTE: ${adminLog.actorNama}\nTanggal: ${dateTimeText(adminLog.createdAt)}`
    adminQr = await qrTextDataUrl(adminQrText)
  }

  const spdkRow = await db.query.spdk.findFirst({ where: eq(spdkTable.btoId, btoRow.id) })
  const printBtoRow = spdkRow?.nomorSpdk ? { ...btoRow, nomorBto: spdkRow.nomorSpdk } : btoRow

  if (btoRow.wilayahTipe === 'luar_negeri') {
    return bteLuarNegeriPrintTemplate({
      btoRow: printBtoRow,
      owner,
      ptRow,
      bteRow,
      dpRow,
      logs,
      LOGO_SRC,
      esc,
      dateText,
      durationDays,
      money,
      adminQr,
    })
  }
  return btePrintTemplate(printBtoRow, owner, ptRow, logs, LOGO_SRC, esc, dateText, durationDays, money, bteRow, dpRow, adminQr)
}

async function loadBtoContext(btoId: string) {
  const [btoRow] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1)
  if (!btoRow) throw new AppError('BTO tidak ditemukan', 404)

  if (!btoRow.transportLabel && btoRow.transportId) {
    const [tRow] = await db.select().from(refTransport).where(eq(refTransport.id, btoRow.transportId)).limit(1)
    if (tRow) {
      btoRow.transportLabel = tRow.label
    }
  }

  const owner = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, btoRow.employeeId),
  })
  const portalEmployee = await fetchPortalEmployee(owner?.employeeId || btoRow.employeeId)
  return {
    btoRow,
    owner: portalEmployee ? {
      ...owner,
      jabatan: portalEmployee.jabatan ?? owner?.role ?? null,
      gradeKode: portalEmployee.gradeKode ?? portalEmployee.grade?.kode ?? owner?.gradeKode,
      gradeLevel: portalEmployee.gradeLevel ?? portalEmployee.grade?.level ?? owner?.gradeLevel,
      unitNama: portalEmployee.unitNama ?? portalEmployee.organisasi?.nama ?? owner?.unitNama,
      unitTipe: portalEmployee.unitTipe ?? portalEmployee.organisasi?.tipe ?? (owner as any)?.unitTipe ?? null,
    } : owner,
  }
}

async function assertDocumentAccess(btoRow: BtoRow, user: any, passedSpdkRow?: typeof spdkTable.$inferSelect | null) {
  const roles = (user.role ?? '').split(',')
  if (roles.some((r: string) => ['super_admin', 'admin', 'sdm'].includes(r))) return
  const userIds = new Set<string>()
  for (const id of [user.sub, user.employeeId]) {
    if (id) userIds.add(String(id))
  }

  // Resolve user's employeeId from localUserCache if user.employeeId is missing
  if (user.sub && !user.employeeId) {
    const cached = await db.query.localUserCache.findFirst({
      where: eq(localUserCache.portalUserId, user.sub),
    })
    if (cached?.employeeId) {
      userIds.add(String(cached.employeeId))
    }
  }

  const cacheRows = await Promise.all([
    user.sub ? db.query.localUserCache.findFirst({ where: eq(localUserCache.portalUserId, user.sub) }) : Promise.resolve(null),
    user.sub ? db.query.localUserCache.findFirst({ where: eq(localUserCache.employeeId, user.sub) }) : Promise.resolve(null),
    user.employeeId ? db.query.localUserCache.findFirst({ where: eq(localUserCache.portalUserId, user.employeeId) }) : Promise.resolve(null),
    user.employeeId ? db.query.localUserCache.findFirst({ where: eq(localUserCache.employeeId, user.employeeId) }) : Promise.resolve(null),
  ])
  for (const cache of cacheRows) {
    if (!cache) continue
    userIds.add(cache.id)
    userIds.add(cache.portalUserId)
    if (cache.employeeId) userIds.add(cache.employeeId)
  }

  if (userIds.has(btoRow.employeeId) || userIds.has(btoRow.pemberiTugasId ?? '')) return
  
  let spdkRow = passedSpdkRow;
  if (spdkRow === undefined) {
    const [row] = await db.select().from(spdkTable).where(eq(spdkTable.btoId, btoRow.id)).limit(1)
    spdkRow = row
  }
  
  if (spdkRow && userIds.has(spdkRow.approverKabagId ?? '')) return

  // 1. Dynamic check for resolved Kabag
  try {
    const cfg = await ensureApproverSpdkConfig()
    if (cfg?.fixedEmployeeId && userIds.has(cfg.fixedEmployeeId)) return
    const resolvedKabag = await resolveSpdkApproverKabag(btoRow, cfg)
    if (resolvedKabag.id && userIds.has(resolvedKabag.id)) return
  } catch (err) {
    console.error('Failed dynamically asserting Kabag document access', err)
  }

  // 2. Supervisor / Atasan hierarchy chain check (traversing up 5 levels)
  try {
    const ownerCache = await db.query.localUserCache.findFirst({
      where: eq(localUserCache.portalUserId, btoRow.employeeId),
    })
    const ownerEmployeeId = ownerCache?.employeeId || btoRow.employeeId
    if (ownerEmployeeId) {
      let currentEmployeeId: string | null | undefined = ownerEmployeeId
      let iterations = 0
      while (currentEmployeeId && iterations < 5) {
        iterations++
        const res = await fetch(
          `${config.portal.apiUrl}/api/sso/employees?id=${currentEmployeeId}`,
          { headers: { 'x-internal': config.portal.internalToken } }
        )
        if (!res.ok) break
        const data = await res.json() as any
        const currentEmp = data.data?.[0]
        if (!currentEmp) break

        const atasanId = currentEmp.atasanId
        if (!atasanId) break

        const cache = await db.query.localUserCache.findFirst({
          where: eq(localUserCache.employeeId, atasanId),
        })
        
        if (userIds.has(atasanId) || (cache?.portalUserId && userIds.has(cache.portalUserId))) {
          return // Supervisor/Kabag/Kasi in hierarchy chain authorized!
        }
        currentEmployeeId = atasanId
      }
    }
  } catch (err) {
    console.error('Failed atasan chain authorization check', err)
  }

  // 3. Involvement check (if they ever acted on this BTO in logs)
  try {
    const userSub = user.sub
    if (userSub) {
      const btoLogs = await db.select().from(btoApprovalLog)
        .where(
          and(
            eq(btoApprovalLog.btoId, btoRow.id),
            eq(btoApprovalLog.actorId, userSub)
          )
        ).limit(1)
      if (btoLogs.length > 0) return

      if (spdkRow && spdkRow.id !== 'preview') {
        const spdkLogs = await db.select().from(spdkApprovalLog)
          .where(
            and(
              eq(spdkApprovalLog.spdkId, spdkRow.id),
              eq(spdkApprovalLog.actorId, userSub)
            )
          ).limit(1)
        if (spdkLogs.length > 0) return
      }
    }
  } catch (err) {
    console.error('Failed involvement authorization check', err)
  }

  // 4. Dashboard approvals list check
  try {
    const approvals = await listBtoApprovalsService({
      id: user.sub,
      employeeId: user.employeeId || null,
      role: user.role ?? 'user',
      gradeLevel: user.gradeLevel ?? null,
    }, true)
    if (approvals.some(b => b.id === btoRow.id)) return
  } catch (err) {
    console.error('Failed dashboard approvals check', err)
  }

  // 5. Dashboard approvals history check
  try {
    const history = await listBtoApprovalsHistoryService({
      id: user.sub,
      role: user.role ?? 'user',
    })
    if (history.some(b => b.id === btoRow.id)) return
  } catch (err) {
    console.error('Failed dashboard approvals history check', err)
  }

  const debugInfo = {
    userIds: Array.from(userIds),
    btoEmployeeId: btoRow.employeeId,
    btoPemberiTugasId: btoRow.pemberiTugasId,
    resolvedKabagId: null as string | null
  }
  try {
    const cfg = await ensureApproverSpdkConfig()
    const resolvedKabag = await resolveSpdkApproverKabag(btoRow, cfg)
    debugInfo.resolvedKabagId = resolvedKabag.id
  } catch (e) {}

  throw new AppError(`Tidak diizinkan membuka dokumen ini. Debug: ${JSON.stringify(debugInfo)}`, 403)
}

export default async function documentRoutes(fastify: FastifyInstance) {
  fastify.get('/bto/:btoId', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = paramsSchema.parse(req.params)
    const { btoRow, owner } = await loadBtoContext(btoId)
    await assertDocumentAccess(btoRow, req.user)
    const logs = await db.select().from(btoApprovalLog)
      .where(eq(btoApprovalLog.btoId, btoId))
      .orderBy(desc(btoApprovalLog.createdAt))
    return reply.type('text/html; charset=utf-8').send(await renderBto(btoRow, owner, logs))
  })

  // Alias with /pdf suffix
  fastify.get('/bto/:btoId/pdf', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = paramsSchema.parse(req.params)
    const { btoRow, owner } = await loadBtoContext(btoId)
    await assertDocumentAccess(btoRow, req.user)
    const logs = await db.select().from(btoApprovalLog)
      .where(eq(btoApprovalLog.btoId, btoId))
      .orderBy(desc(btoApprovalLog.createdAt))
    return reply.type('text/html; charset=utf-8').send(await renderBto(btoRow, owner, logs))
  })

  fastify.get('/spdk/:btoId', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = paramsSchema.parse(req.params)
    const { btoRow, owner } = await loadBtoContext(btoId)
    let [spdkRow] = await db.select().from(spdkTable).where(eq(spdkTable.btoId, btoId)).limit(1)
    if (!spdkRow) {
      const roles = ((req.user as any).role ?? '').split(',')
      const isAdminOrReviewer = roles.some((r: string) => ['super_admin', 'admin', 'sdm'].includes(r))
      const isPemberiTugas = String((req.user as any).employeeId) === String(btoRow.pemberiTugasId)
      const isOwner = String((req.user as any).employeeId) === String(btoRow.employeeId)
      if (isAdminOrReviewer || isPemberiTugas || isOwner) {
        const parts = (btoRow.nomorBto ?? '').split('/').map((part) => part.trim()).filter(Boolean)
        const nomorSpdk = parts.length >= 5 
          ? `${parts[0]}/${parts[1]}/SPDK/${parts[3]}/${parts[4]}`
          : (btoRow.nomorBto ?? '').replace(/\/BTO\//i, '/SPDK/')
        spdkRow = {
          id: 'preview',
          nomorSpdk: nomorSpdk || 'DRAFT-SPDK',
          btoId: btoRow.id,
          nomorBto: btoRow.nomorBto,
          status: 'DRAFT',
          diterbitkanOleh: null,
          diterbitkanNama: null,
          tanggalTerbit: null,
          catatanAdmin: null,
          approverKabagId: null,
          approverKabagNama: null,
          tahun: new Date().getFullYear().toString(),
          sequence: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      } else {
        throw new AppError('SPDK belum diterbitkan untuk BTO ini', 404)
      }
    }
    await assertDocumentAccess(btoRow, req.user, spdkRow)
    const logs = spdkRow.id === 'preview'
      ? []
      : await db.select().from(spdkApprovalLog)
          .where(eq(spdkApprovalLog.spdkId, spdkRow.id))
          .orderBy(desc(spdkApprovalLog.createdAt))
    const [stamp] = await db.select().from(attendStamp)
      .where(eq(attendStamp.btoId, btoId))
      .orderBy(desc(attendStamp.stamped_at))
      .limit(1)
    return reply.type('text/html; charset=utf-8').send(await renderSpdk(btoRow, owner, spdkRow, logs, stamp ?? null))
  })

  // Alias with /pdf suffix
  fastify.get('/spdk/:btoId/pdf', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = paramsSchema.parse(req.params)
    const { btoRow, owner } = await loadBtoContext(btoId)
    let [spdkRow] = await db.select().from(spdkTable).where(eq(spdkTable.btoId, btoId)).limit(1)
    if (!spdkRow) {
      const roles = ((req.user as any).role ?? '').split(',')
      const isAdminOrReviewer = roles.some((r: string) => ['super_admin', 'admin', 'sdm'].includes(r))
      const isPemberiTugas = String((req.user as any).employeeId) === String(btoRow.pemberiTugasId)
      const isOwner = String((req.user as any).employeeId) === String(btoRow.employeeId)
      if (isAdminOrReviewer || isPemberiTugas || isOwner) {
        const parts = (btoRow.nomorBto ?? '').split('/').map((part) => part.trim()).filter(Boolean)
        const nomorSpdk = parts.length >= 5 
          ? `${parts[0]}/${parts[1]}/SPDK/${parts[3]}/${parts[4]}`
          : (btoRow.nomorBto ?? '').replace(/\/BTO\//i, '/SPDK/')
        spdkRow = {
          id: 'preview',
          nomorSpdk: nomorSpdk || 'DRAFT-SPDK',
          btoId: btoRow.id,
          nomorBto: btoRow.nomorBto,
          status: 'DRAFT',
          diterbitkanOleh: null,
          diterbitkanNama: null,
          tanggalTerbit: null,
          catatanAdmin: null,
          approverKabagId: null,
          approverKabagNama: null,
          tahun: new Date().getFullYear().toString(),
          sequence: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      } else {
        throw new AppError('SPDK belum diterbitkan untuk BTO ini', 404)
      }
    }
    await assertDocumentAccess(btoRow, req.user, spdkRow)
    const logs = spdkRow.id === 'preview'
      ? []
      : await db.select().from(spdkApprovalLog)
          .where(eq(spdkApprovalLog.spdkId, spdkRow.id))
          .orderBy(desc(spdkApprovalLog.createdAt))
    const [stamp] = await db.select().from(attendStamp)
      .where(eq(attendStamp.btoId, btoId))
      .orderBy(desc(attendStamp.stamped_at))
      .limit(1)
    return reply.type('text/html; charset=utf-8').send(await renderSpdk(btoRow, owner, spdkRow, logs, stamp ?? null))
  })

  fastify.get('/dp/:btoId', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = paramsSchema.parse(req.params)
    const { btoRow, owner } = await loadBtoContext(btoId)
    await assertDocumentAccess(btoRow, req.user)
    const dpRow = await db.query.dp.findFirst({
      where: eq(dpTable.btoId, btoId),
      with: { dpRincian: true },
    })
    if (!dpRow) throw new AppError('Panjar/DP belum tersedia untuk BTO ini', 404)
    const logs = await db.select().from(dpApprovalLog)
      .where(eq(dpApprovalLog.dpId, dpRow.id))
      .orderBy(desc(dpApprovalLog.createdAt))
    return reply.type('text/html; charset=utf-8').send(await renderDp(btoRow, owner, dpRow, logs))
  })

  // Alias with /pdf suffix
  fastify.get('/dp/:btoId/pdf', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = paramsSchema.parse(req.params)
    const { btoRow, owner } = await loadBtoContext(btoId)
    await assertDocumentAccess(btoRow, req.user)
    const dpRow = await db.query.dp.findFirst({
      where: eq(dpTable.btoId, btoId),
      with: { dpRincian: true },
    })
    if (!dpRow) throw new AppError('Panjar/DP belum tersedia untuk BTO ini', 404)
    const logs = await db.select().from(dpApprovalLog)
      .where(eq(dpApprovalLog.dpId, dpRow.id))
      .orderBy(desc(dpApprovalLog.createdAt))
    return reply.type('text/html; charset=utf-8').send(await renderDp(btoRow, owner, dpRow, logs))
  })

  fastify.get('/bte/:btoId', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = paramsSchema.parse(req.params)
    const { btoRow, owner } = await loadBtoContext(btoId)
    await assertDocumentAccess(btoRow, req.user)
    const bteRow = await db.query.bte.findFirst({
      where: eq(bteTable.btoId, btoId),
      with: { bteRincian: true, bteBiayaLain: true },
    })
    if (!bteRow) throw new AppError('BTE belum tersedia untuk BTO ini', 404)
    const logs = await db.select().from(bteApprovalLog)
      .where(eq(bteApprovalLog.bteId, bteRow.id))
      .orderBy(desc(bteApprovalLog.createdAt))
    return reply.type('text/html; charset=utf-8').send(await renderBte(btoRow, owner, bteRow, logs))
  })

  // Alias with /pdf suffix
  fastify.get('/bte/:btoId/pdf', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = paramsSchema.parse(req.params)
    const { btoRow, owner } = await loadBtoContext(btoId)
    await assertDocumentAccess(btoRow, req.user)
    const bteRow = await db.query.bte.findFirst({
      where: eq(bteTable.btoId, btoId),
      with: { bteRincian: true, bteBiayaLain: true },
    })
    if (!bteRow) throw new AppError('BTE belum tersedia untuk BTO ini', 404)
    const logs = await db.select().from(bteApprovalLog)
      .where(eq(bteApprovalLog.bteId, bteRow.id))
      .orderBy(desc(bteApprovalLog.createdAt))
    return reply.type('text/html; charset=utf-8').send(await renderBte(btoRow, owner, bteRow, logs))
  })
}
