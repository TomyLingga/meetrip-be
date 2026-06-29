// ─── DP Service ───────────────────────────────────────────────────────────────
import { db } from '../db/connection';
import { dp, dpRincian, dpApprovalLog, bto } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/errorHandler';

export async function getDpByBtoIdService(btoId: string) {
  const row = await db.query.dp.findFirst({
    where: eq(dp.btoId, btoId),
    with: {
      dpRincian: true,
    },
  });
  return row || null;
}

export async function createOrUpdateDpService(
  btoId: string,
  actor: { id: string; nama: string },
  data: {
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
  }
) {
  // Check BTO status
  const [btoRow] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1);
  if (!btoRow) throw new AppError('BTO tidak ditemukan', 404);
  if (btoRow.status !== 'DRAFT' && btoRow.status !== 'REVISION_DP') {
    throw new AppError('DP hanya bisa diisi saat BTO berstatus DRAFT atau REVISION_DP', 400);
  }

  // Find or create DP record
  let dpRow = await db.query.dp.findFirst({
    where: eq(dp.btoId, btoId),
  });

  const exchangeRate = data.exchangeRateUsd || 1;
  let totalIdr = 0;
  let totalUsd = 0;

  // Calculate totals
  data.rincian.forEach((r) => {
    if (r.useDollar) {
      const valUsd = Number(r.nilaiUsd || r.nilaiTotal);
      totalUsd += valUsd;
      totalIdr += valUsd * exchangeRate;
    } else {
      totalIdr += Number(r.nilaiTotal);
    }
  });

  if (!dpRow) {
    const [inserted] = await db
      .insert(dp)
      .values({
        btoId,
        status: 'DRAFT',
        exchangeRateUsd: String(exchangeRate),
        totalIdr: String(totalIdr),
        totalUsd: String(totalUsd),
      })
      .returning();
    dpRow = inserted;
  } else {
    await db
      .update(dp)
      .set({
        exchangeRateUsd: String(exchangeRate),
        totalIdr: String(totalIdr),
        totalUsd: String(totalUsd),
        updatedAt: new Date(),
      })
      .where(eq(dp.id, dpRow.id));
  }

  // Clear existing items and insert new ones
  await db.delete(dpRincian).where(eq(dpRincian.dpId, dpRow.id));

  if (data.rincian.length > 0) {
    await db.insert(dpRincian).values(
      data.rincian.map((r) => ({
        dpId: dpRow!.id,
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

  return { dpId: dpRow.id, totalIdr, totalUsd };
}
