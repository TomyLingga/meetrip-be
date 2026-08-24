import { db } from '../../src/db/connection'
import { refRincianBiaya, dpRincian } from '../../src/db/schema'
import { eq, like } from 'drizzle-orm'

async function main() {
  console.log('Fixing ref_rincian_biaya...');
  await db.update(refRincianBiaya).set({ kategori: 'laundry' }).where(eq(refRincianBiaya.kode, 'LAUNDRY'));
  await db.update(refRincianBiaya).set({ kategori: 'hotel' }).where(eq(refRincianBiaya.kode, 'HOTEL'));
  await db.update(refRincianBiaya).set({ kategori: 'saku' }).where(eq(refRincianBiaya.kode, 'UANG_SAKU'));
  
  console.log('Fixing dp_rincian...');
  await db.update(dpRincian).set({ kategori: 'laundry' }).where(like(dpRincian.rincianLabel, '%Laundry%'));
  await db.update(dpRincian).set({ kategori: 'hotel' }).where(like(dpRincian.rincianLabel, '%Hotel%'));
  await db.update(dpRincian).set({ kategori: 'saku' }).where(like(dpRincian.rincianLabel, '%Saku%'));

  const rincians = await db.select().from(refRincianBiaya);
  console.log('--- updated ref_rincian_biaya ---');
  console.log(rincians.map(r => ({ kode: r.kode, label: r.label, kategori: r.kategori })));

  const dps = await db.select().from(dpRincian).limit(5);
  console.log('\n--- updated dp_rincian (sample) ---');
  console.log(dps.map(d => ({ rincianLabel: d.rincianLabel, kategori: d.kategori })));
  
  process.exit(0);
}

main().catch(console.error);
