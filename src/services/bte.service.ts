// ─── BTE Service ───────────────────────────────────────────────────────────────
import { db } from '../db/connection';
import { bte, bteRincian, bteBiayaLain, bteApprovalLog, bto, btoApprovalLog, localUserCache } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/errorHandler';
import { getGradeIdByLevel, hitungDurasiHariMalam, validateRincianAgainstPagu } from './pagu.service';

function requireCatatanTindakan(action: string, catatan?: string) {
  if (!catatan?.trim()) {
    throw new AppError(`Catatan wajib diisi untuk aksi ${action}`, 400);
  }
}

export async function getBteByBtoIdService(btoId: string) {
  const row = await db.query.bte.findFirst({
    where: eq(bte.btoId, btoId),
    with: {
      bteRincian: true,
      bteBiayaLain: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    rincian: row.bteRincian,
    biayaLain: row.bteBiayaLain,
  };
}

export async function createOrUpdateBteService(
  btoId: string,
  actor: { id: string; nama: string; gradeLevel?: number | null },
  isAdmin: boolean,
  data: {
    tglBerangkat?: Date;
    jamBerangkat?: string;
    tglKembali?: Date;
    jamKembali?: string;
    exchangeRateUsd?: number;
    rincian: Array<{
      rincianId: string;
      rincianLabel?: string;
      jumlahHari: number;
      nilaiPerHari: number;
      nilaiTotal: number;
      useDollar: boolean;
      nilaiUsd?: number;
      paguSaatInput?: number;
      isUnlimited?: boolean;
      catatan?: string;
    }>;
    biayaLain?: Array<{
      keterangan: string;
      nilai: number;
      useDollar: boolean;
      nilaiUsd?: number;
    }>;
  }
) {
  const [btoRow] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1);
  if (!btoRow) throw new AppError('BTO tidak ditemukan', 404);
  if (!isAdmin && btoRow.employeeId !== actor.id) {
    throw new AppError('Tidak diizinkan mengubah BTE BTO ini', 403);
  }

  let bteRow = await db.query.bte.findFirst({
    where: eq(bte.btoId, btoId),
  });

  if (!isAdmin && bteRow && (bteRow.status === 'ADMIN_REVIEW' || bteRow.status === 'SUBMITTED')) {
    if (btoRow.status !== 'ADMIN_BTE_REVIEW') {
      await db.update(bto).set({
        status: 'ADMIN_BTE_REVIEW',
        updatedAt: new Date(),
      }).where(eq(bto.id, btoId));
    }
    return {
      bteId: bteRow.id,
      totalIdr: Number(bteRow.totalIdr || 0),
      totalUsd: Number(bteRow.totalUsd || 0),
      alreadySubmitted: true,
    };
  }

  const canUserEdit =
    btoRow.status === 'ATTENDED' ||
    btoRow.status === 'REPORT_UPLOADED' ||
    bteRow?.status === 'REVISION';

  if (!isAdmin && !canUserEdit) {
    throw new AppError('BTE hanya bisa diisi setelah absensi dihadiri (attended), laporan diupload atau saat revisi BTE', 400);
  }
  if (!isAdmin && bteRow && bteRow.status !== 'DRAFT' && bteRow.status !== 'REVISION') {
    throw new AppError(`BTE dengan status ${bteRow.status} tidak bisa diubah`, 400);
  }
  if (!btoRow.wilayahTipe) {
    throw new AppError('Wilayah BTO belum terkunci, BTE belum bisa dihitung', 400);
  }

  const actualBerangkat = data.tglBerangkat || btoRow.estBerangkat;
  const actualKembali = data.tglKembali || btoRow.estKembali;
  const { jumlahHari, jumlahMalam } = hitungDurasiHariMalam(
    new Date(actualBerangkat),
    new Date(actualKembali),
  );

  let userCache = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, btoRow.employeeId),
  });
  if (!userCache) {
    userCache = await db.query.localUserCache.findFirst({
      where: eq(localUserCache.employeeId, btoRow.employeeId),
    });
  }
  const gradeLevel = userCache?.gradeLevel ?? (btoRow.employeeId === actor.id ? actor.gradeLevel : null);
  const gradeId = gradeLevel != null ? await getGradeIdByLevel(gradeLevel) : null;
  if (!gradeId) throw new AppError('Grade karyawan tidak ditemukan di master', 400);

  await validateRincianAgainstPagu({
    gradeId,
    wilayahTipe: btoRow.wilayahTipe,
    tanggal: new Date(actualBerangkat),
    jumlahHari,
    jumlahMalam,
    rincian: data.rincian.map((item) => ({
      rincianId: item.rincianId,
      rincianLabel: item.rincianLabel,
      nilaiTotal: Number(item.nilaiTotal),
      nilaiUsd: Number(item.nilaiUsd ?? 0),
      useDollar: item.useDollar,
    })),
  });

  const exchangeRate = data.exchangeRateUsd || 1;
  let totalIdr = 0;
  let totalUsd = 0;

  // Calculate totals from rincian
  data.rincian.forEach((r) => {
    // Validate value against pagu
    if (r.paguSaatInput && !r.isUnlimited) {
      if (Number(r.nilaiTotal) > Number(r.paguSaatInput)) {
        throw new AppError(`Pengajuan biaya '${r.rincianLabel}' sebesar ${r.nilaiTotal} melebihi pagu sebesar ${r.paguSaatInput}`, 400);
      }
    }

    if (r.useDollar) {
      const valUsd = Number(r.nilaiUsd || r.nilaiTotal);
      totalUsd += valUsd;
      totalIdr += valUsd * exchangeRate;
    } else {
      totalIdr += Number(r.nilaiTotal);
    }
  });

  // Calculate totals from biaya lain
  if (data.biayaLain) {
    data.biayaLain.forEach((bl) => {
      if (bl.useDollar) {
        const valUsd = Number(bl.nilaiUsd || bl.nilai);
        totalUsd += valUsd;
        totalIdr += valUsd * exchangeRate;
      } else {
        totalIdr += Number(bl.nilai);
      }
    });
  }

  const bteData = {
    btoId,
    status: bteRow?.status || 'DRAFT',
    tglBerangkat: actualBerangkat,
    jamBerangkat: data.jamBerangkat,
    tglKembali: actualKembali,
    jamKembali: data.jamKembali,
    exchangeRateUsd: String(exchangeRate),
    totalIdr: String(totalIdr),
    totalUsd: String(totalUsd),
    updatedAt: new Date(),
  };

  if (!bteRow) {
    const [inserted] = await db.insert(bte).values(bteData).returning();
    bteRow = inserted;
  } else {
    await db.update(bte).set(bteData).where(eq(bte.id, bteRow.id));
  }

  // Clear existing items and insert new ones
  await db.delete(bteRincian).where(eq(bteRincian.bteId, bteRow.id));
  if (data.rincian.length > 0) {
    await db.insert(bteRincian).values(
      data.rincian.map((r) => ({
        bteId: bteRow!.id,
        rincianId: r.rincianId,
        rincianLabel: r.rincianLabel,
        jumlahHari: r.jumlahHari,
        nilaiPerHari: String(r.nilaiPerHari),
        nilaiTotal: String(r.nilaiTotal),
        useDollar: r.useDollar,
        nilaiUsd: r.useDollar ? String(r.nilaiUsd || r.nilaiTotal) : '0',
        paguSaatInput: r.paguSaatInput ? String(r.paguSaatInput) : undefined,
        isUnlimited: r.isUnlimited ?? false,
        catatan: r.catatan,
      }))
    );
  }

  await db.delete(bteBiayaLain).where(eq(bteBiayaLain.bteId, bteRow.id));
  if (data.biayaLain && data.biayaLain.length > 0) {
    await db.insert(bteBiayaLain).values(
      data.biayaLain.map((bl) => ({
        bteId: bteRow!.id,
        keterangan: bl.keterangan,
        nilai: String(bl.nilai),
        useDollar: bl.useDollar,
        nilaiUsd: bl.useDollar ? String(bl.nilaiUsd || bl.nilai) : '0',
      }))
    );
  }

  return { bteId: bteRow.id, totalIdr, totalUsd };
}

export async function submitBteService(bteId: string, actor: { id: string; nama: string }, isAdmin: boolean) {
  const [bteRow] = await db.select().from(bte).where(eq(bte.id, bteId)).limit(1);
  if (!bteRow) throw new AppError('BTE tidak ditemukan', 404);
  const [btoRow] = await db.select().from(bto).where(eq(bto.id, bteRow.btoId)).limit(1);
  if (!btoRow) throw new AppError('BTO tidak ditemukan', 404);
  if (!isAdmin && btoRow.employeeId !== actor.id) {
    throw new AppError('Tidak diizinkan submit BTE ini', 403);
  }
  if (bteRow.status === 'ADMIN_REVIEW' || bteRow.status === 'SUBMITTED') {
    if (btoRow.status !== 'ADMIN_BTE_REVIEW') {
      await db.update(bto).set({
        status: 'ADMIN_BTE_REVIEW',
        updatedAt: new Date(),
      }).where(eq(bto.id, bteRow.btoId));
    }
    return { status: 'ADMIN_REVIEW', btoStatus: 'ADMIN_BTE_REVIEW', alreadySubmitted: true };
  }
  if (bteRow.status !== 'DRAFT' && bteRow.status !== 'REVISION') {
    throw new AppError(`Tidak bisa submit BTE dari status ${bteRow.status}`, 400);
  }
  if (!bteRow.kuitansiPath) {
    throw new AppError('Kuitansi/receipt BTE wajib diupload sebelum submit BTE', 400);
  }
  if (!bteRow.laporanPath) {
    throw new AppError('Laporan Kegiatan/Perjalanan wajib diupload sebelum submit BTE', 400);
  }

  await db.update(bte).set({
    status: 'ADMIN_REVIEW',
    submittedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(bte.id, bteId));

  // Update BTO status to admin BTE review
  await db.update(bto).set({
    status: 'ADMIN_BTE_REVIEW',
    updatedAt: new Date(),
  }).where(eq(bto.id, bteRow.btoId));

  await db.insert(bteApprovalLog).values({
    bteId,
    aksi: 'submit',
    actorId: actor.id,
    actorNama: actor.nama,
    catatan: 'BTE diajukan ke Admin untuk review',
  });

  await db.insert(btoApprovalLog).values({
    btoId: bteRow.btoId,
    tahap: 'bte',
    aksi: 'submit',
    actorId: actor.id,
    actorNama: actor.nama,
    statusDari: btoRow.status,
    statusKe: 'ADMIN_BTE_REVIEW',
    catatan: 'Realisasi BTE diajukan ke Admin untuk review',
  });

  return { status: 'ADMIN_REVIEW', btoStatus: 'ADMIN_BTE_REVIEW', alreadySubmitted: false };
}

export async function adminApproveBteService(bteId: string, action: 'approve' | 'reject' | 'revision', actor: { id: string; nama: string }, catatan?: string) {
  const [bteRow] = await db.select().from(bte).where(eq(bte.id, bteId)).limit(1);
  if (!bteRow) throw new AppError('BTE tidak ditemukan', 404);
  if (bteRow.status !== 'ADMIN_REVIEW' && bteRow.status !== 'SUBMITTED') {
    throw new AppError('BTE bukan dalam tahap review admin', 400);
  }
  requireCatatanTindakan(action, catatan);

  const statusMap = {
    approve: 'PENDING_PAYMENT',
    reject: 'REJECTED',
    revision: 'REVISION',
  } as const;

  const nextStatus = statusMap[action];
  const btoStatusMap = {
    approve: 'BTE_PAYMENT',
    reject: 'REJECTED',
    revision: 'REVISION_BTE',
  } as const;

  await db.update(bte).set({
    status: nextStatus,
    updatedAt: new Date(),
  }).where(eq(bte.id, bteId));

  await db.update(bto).set({
    status: btoStatusMap[action],
    updatedAt: new Date(),
  }).where(eq(bto.id, bteRow.btoId));

  await db.insert(bteApprovalLog).values({
    bteId,
    aksi: action,
    actorId: actor.id,
    actorNama: actor.nama,
    catatan,
  });

  await db.insert(btoApprovalLog).values({
    btoId: bteRow.btoId,
    tahap: 'bte',
    aksi: action,
    actorId: actor.id,
    actorNama: actor.nama,
    statusDari: 'ADMIN_BTE_REVIEW',
    statusKe: btoStatusMap[action],
    catatan,
  });

  return { status: nextStatus };
}

export async function markBtePaidService(bteId: string, actor: { id: string; nama: string }) {
  const [bteRow] = await db.select().from(bte).where(eq(bte.id, bteId)).limit(1);
  if (!bteRow) throw new AppError('BTE tidak ditemukan', 404);
  if (bteRow.status !== 'PENDING_PAYMENT') {
    throw new AppError('BTE belum masuk status menunggu pembayaran', 400);
  }

  await db.update(bte).set({
    status: 'PAID',
    paidAt: new Date(),
    paidBy: actor.id,
    paidByNama: actor.nama,
    updatedAt: new Date(),
  }).where(eq(bte.id, bteId));

  await db.update(bto).set({
    status: 'COMPLETED',
    updatedAt: new Date(),
  }).where(eq(bto.id, bteRow.btoId));

  await db.insert(bteApprovalLog).values({
    bteId,
    aksi: 'mark_paid',
    actorId: actor.id,
    actorNama: actor.nama,
    catatan: 'Biaya perjalanan dinas sudah dibayarkan',
  });

  await db.insert(btoApprovalLog).values({
    btoId: bteRow.btoId,
    tahap: 'bte_payment',
    aksi: 'mark_paid',
    actorId: actor.id,
    actorNama: actor.nama,
    statusDari: 'BTE_PAYMENT',
    statusKe: 'COMPLETED',
    catatan: 'Biaya perjalanan dinas sudah dibayarkan',
  });
}
