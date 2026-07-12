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
  if (!row) return null;
  return {
    ...row,
    rincian: row.dpRincian,
  };
}

export async function createOrUpdateDpService(
  btoId: string,
  actor: { id: string; nama: string },
  isAdmin: boolean,
  data: {
    exchangeRateUsd?: number;
    rincian: Array<{
      rincianId: string;
      rincianLabel?: string;
      kategori?: string;
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
  if (!isAdmin && btoRow.employeeId !== actor.id) {
    throw new AppError('Tidak diizinkan mengubah DP BTO ini', 403);
  }
  if (!btoRow.butuhDp) {
    throw new AppError('BTO ini tidak membutuhkan DP', 400);
  }
  if (!isAdmin && btoRow.status !== 'DRAFT' && btoRow.status !== 'REVISION_DP') {
    throw new AppError('DP hanya bisa diisi saat BTO berstatus DRAFT atau REVISION_DP', 400);
  }

  // Find or create DP record — track isNew before insert/update
  let dpRow = await db.query.dp.findFirst({
    where: eq(dp.btoId, btoId),
  });
  const isNew = !dpRow;

  // If any rincian is in USD, a real positive exchange rate is mandatory — otherwise
  // USD amounts would be booked into totalIdr at a 1:1 rate (e.g. USD 500 → Rp 500).
  const hasUsdRincian = data.rincian.some((r) => r.useDollar);
  if (hasUsdRincian && !(Number(data.exchangeRateUsd) > 0)) {
    throw new AppError('Kurs USD (exchangeRateUsd) wajib diisi dan lebih dari 0 karena ada rincian dalam USD', 400);
  }
  const exchangeRate = Number(data.exchangeRateUsd) > 0 ? Number(data.exchangeRateUsd) : 1;
  let totalIdr = 0;
  let totalUsd = 0;

  // Calculate totals
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
        kategori: r.kategori || 'lain_lain',
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

  // ─── Log ke dp_approval_log ──────────────────────────────────────────────────
  const aksiLog = isNew ? 'create' : 'update';
  await db.insert(dpApprovalLog).values({
    dpId: dpRow.id,
    aksi: aksiLog,
    actorId: actor.id,
    actorNama: actor.nama,
    catatan: `Rincian DP di${aksiLog === 'update' ? 'perbarui' : 'simpan'} oleh ${actor.nama}`,
  });

  return { dpId: dpRow.id, totalIdr, totalUsd };
}
