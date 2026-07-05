import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import QRCode from 'qrcode'
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
} from '../db/schema'
import { AppError } from '../utils/errorHandler'
import { btoPrintTemplate } from '../utils/print-templates/btoPdf'
import { spdkPrintTemplate } from '../utils/print-templates/spdkPdf'
import { panjarPrintTemplate } from '../utils/print-templates/panjarPdf'
import { btePrintTemplate } from '../utils/print-templates/btePdf'

const paramsSchema = z.object({
  btoId: z.string().uuid(),
})

type BtoRow = typeof bto.$inferSelect
type BtoLog = typeof btoApprovalLog.$inferSelect
type DpLog = typeof dpApprovalLog.$inferSelect
type SpdkLog = typeof spdkApprovalLog.$inferSelect
type BteLog = typeof bteApprovalLog.$inferSelect
type AttendStampRow = typeof attendStamp.$inferSelect

const LOGO_SRC = '/uploads/documents/inl.png'

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
    width: 118,
  })
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
  const sdmLog = pickLog(logs, (log) => ['sdm', 'admin_dp'].includes(log.tahap) && log.aksi === 'approve')
  const ptLog = pickLog(logs, (log) => log.tahap === 'pemberi_tugas' && log.aksi === 'approve')
  
  let ptRow = null
  if (btoRow.pemberiTugasId) {
    const cached = await db.select().from(localUserCache).where(eq(localUserCache.id, btoRow.pemberiTugasId)).limit(1)
    ptRow = cached[0] || null
  }
  
  const sdmName = sdmLog ? sdmLog.actorNama : ''
  return btoPrintTemplate(btoRow, owner, ptRow, sdmLog, sdmName || '', LOGO_SRC, esc, dateText, durationDays)
}

async function renderSpdk(
  btoRow: BtoRow,
  owner: any,
  spdkRow: typeof spdkTable.$inferSelect,
  logs: SpdkLog[],
  stamp: AttendStampRow | null,
) {
  const issueLog = pickLog(logs, (log) => log.aksi === 'issued')
  const approveLog = pickLog(logs, (log) => log.aksi === 'approve')
  const attendQr = await qrDataUrl(stamp
    ? {
        document: 'SPDK_ATTEND',
        nomorSpdk: spdkRow.nomorSpdk,
        nomorBto: btoRow.nomorBto,
        employeeName: btoRow.employeeNama ?? owner?.nama,
        employeeId: stamp.employeeId,
        location: {
          latitude: stamp.stampLat,
          longitude: stamp.stampLng,
          distanceFromDestinationMeter: stamp.jarakDariTujuanM,
          destinationName: btoRow.tujuanNama,
          destinationAddress: btoRow.tujuanAlamat,
        },
        valid: stamp.isValid,
        adminOverride: stamp.isAdminOverride,
        overrideBy: stamp.overrideOlehNama,
        timestamp: isoText(stamp.stamped_at),
      }
    : null)
  const body = `<p class="center"><b>Nomor: ${esc(spdkRow.nomorSpdk)}</b></p>
  <section class="box">
    <p class="section-title">I. Diberikan Kepada</p>
    ${employeeSection(btoRow, owner)}
    ${tripSection(btoRow)}
  </section>
  <section class="box">
    <p class="section-title">II. Catatan</p>
    <ul>
      <li>Biaya ditanggung oleh PT. Industri Nabati Lestari.</li>
      <li>Tanggal kembali dari perjalanan harap dilaporkan kepada PT. Industri Nabati Lestari.</li>
      <li>Mohon agar pihak berwenang memberikan bantuan seperlunya.</li>
    </ul>
  </section>
  ${signatureSection([
    signatureSlot('QR Attend / Stempel Tujuan', btoRow.employeeNama ?? owner?.nama, stamp ? dateTimeText(stamp.stamped_at) : null, attendQr),
    await approvalSlot('Kabag / SDM', 'SPDK', 'Kabag Approval', btoRow, approveLog, spdkRow.approverKabagNama ?? ''),
    await approvalSlot('Diterbitkan Oleh', 'SPDK', 'Admin Issuer', btoRow, issueLog, spdkRow.diterbitkanNama ?? 'PT. Industri Nabati Lestari'),
  ])}`
  return documentShell('Form SPDK', 'SURAT PERINTAH PERJALANAN DINAS KARYAWAN', body, 'MT-SPDK')
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

  return panjarPrintTemplate(btoRow, owner, ptRow, logs, LOGO_SRC, esc, dateText, durationDays, money)
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

  return btePrintTemplate(btoRow, owner, ptRow, logs, LOGO_SRC, esc, dateText, durationDays, money, bteRow, dpRow)
}

async function loadBtoContext(btoId: string) {
  const [btoRow] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1)
  if (!btoRow) throw new AppError('BTO tidak ditemukan', 404)

  const owner = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, btoRow.employeeId),
  })
  return { btoRow, owner }
}

function assertDocumentAccess(btoRow: BtoRow, user: any, spdkRow?: typeof spdkTable.$inferSelect | null) {
  if (['super_admin', 'admin', 'sdm'].includes(user.role ?? '')) return
  const userIds = [user.sub, user.employeeId].filter(Boolean)
  if (userIds.includes(btoRow.employeeId) || userIds.includes(btoRow.pemberiTugasId ?? '')) return
  if (spdkRow && userIds.includes(spdkRow.approverKabagId ?? '')) return
  throw new AppError('Tidak diizinkan membuka dokumen ini', 403)
}

export default async function documentRoutes(fastify: FastifyInstance) {
  fastify.get('/bto/:btoId', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = paramsSchema.parse(req.params)
    const { btoRow, owner } = await loadBtoContext(btoId)
    assertDocumentAccess(btoRow, req.user)
    const logs = await db.select().from(btoApprovalLog)
      .where(eq(btoApprovalLog.btoId, btoId))
      .orderBy(desc(btoApprovalLog.createdAt))
    return reply.type('text/html; charset=utf-8').send(await renderBto(btoRow, owner, logs))
  })

  fastify.get('/spdk/:btoId', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = paramsSchema.parse(req.params)
    const { btoRow, owner } = await loadBtoContext(btoId)
    const [spdkRow] = await db.select().from(spdkTable).where(eq(spdkTable.btoId, btoId)).limit(1)
    if (!spdkRow) throw new AppError('SPDK belum diterbitkan untuk BTO ini', 404)
    assertDocumentAccess(btoRow, req.user, spdkRow)
    const logs = await db.select().from(spdkApprovalLog)
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
    assertDocumentAccess(btoRow, req.user)
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
    assertDocumentAccess(btoRow, req.user)
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
