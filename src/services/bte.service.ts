// ─── BTE Service ───────────────────────────────────────────────────────────────
import { db } from '../db/connection';
import { bte, bteRincian, bteBiayaLain, bteApprovalLog, bto } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/errorHandler';

export async function getBteByBtoIdService(btoId: string) {
  const row = await db.query.bte.findFirst({
    where: eq(bte.btoId, btoId),
    with: {
      bteRincian: true,
      bteBiayaLain: true,
    },
  });
  return row || null;
}

export async function createOrUpdateBteService(
  btoId: string,
  actor: { id: string; nama: string },
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
  if (btoRow.status !== 'REPORT_UPLOADED' && btoRow.status !== 'COMPLETED') {
    throw new AppError('BTE hanya bisa diisi jika laporan perjalanan sudah diupload', 400);
  }

  let bteRow = await db.query.bte.findFirst({
    where: eq(bte.btoId, btoId),
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
    tglBerangkat: data.tglBerangkat || btoRow.estBerangkat,
    jamBerangkat: data.jamBerangkat,
    tglKembali: data.tglKembali || btoRow.estKembali,
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

export async function submitBteService(bteId: string, actor: { id: string; nama: string }) {
  const [bteRow] = await db.select().from(bte).where(eq(bte.id, bteId)).limit(1);
  if (!bteRow) throw new AppError('BTE tidak ditemukan', 404);

  await db.update(bte).set({
    status: 'SUBMITTED',
    submittedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(bte.id, bteId));

  // Update BTO status to COMPLETED
  await db.update(bto).set({
    status: 'COMPLETED',
    updatedAt: new Date(),
  }).where(eq(bto.id, bteRow.btoId));

  await db.insert(bteApprovalLog).values({
    bteId,
    aksi: 'submit',
    actorId: actor.id,
    actorNama: actor.nama,
    catatan: 'BTE diajukan ke Admin',
  });
}

export async function adminApproveBteService(bteId: string, action: 'approve' | 'reject' | 'revision', actor: { id: string; nama: string }, catatan?: string) {
  const [bteRow] = await db.select().from(bte).where(eq(bte.id, bteId)).limit(1);
  if (!bteRow) throw new AppError('BTE tidak ditemukan', 404);

  const statusMap = {
    approve: 'PENDING_PAYMENT',
    reject: 'REJECTED',
    revision: 'REVISION',
  } as const;

  const nextStatus = statusMap[action];

  await db.update(bte).set({
    status: nextStatus,
    updatedAt: new Date(),
  }).where(eq(bte.id, bteId));

  await db.insert(bteApprovalLog).values({
    bteId,
    aksi: action,
    actorId: actor.id,
    actorNama: actor.nama,
    catatan,
  });

  return { status: nextStatus };
}

export async function markBtePaidService(bteId: string, actor: { id: string; nama: string }) {
  const [bteRow] = await db.select().from(bte).where(eq(bte.id, bteId)).limit(1);
  if (!bteRow) throw new AppError('BTE tidak ditemukan', 404);

  await db.update(bte).set({
    status: 'PAID',
    paidAt: new Date(),
    paidBy: actor.id,
    paidByNama: actor.nama,
    updatedAt: new Date(),
  }).where(eq(bte.id, bteId));

  await db.insert(bteApprovalLog).values({
    bteId,
    aksi: 'mark_paid',
    actorId: actor.id,
    actorNama: actor.nama,
    catatan: 'Biaya perjalanan dinas sudah dibayarkan',
  });
}
