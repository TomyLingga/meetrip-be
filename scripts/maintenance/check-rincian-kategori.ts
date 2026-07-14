import { db } from '../../src/db/connection'
import { refRincianBiaya, dpRincian } from '../../src/db/schema'

async function main() {
  const rincians = await db.select().from(refRincianBiaya);
  console.log('--- ref_rincian_biaya ---');
  console.log(rincians.map(r => ({ kode: r.kode, label: r.label, kategori: r.kategori })));

  const dps = await db.select().from(dpRincian).limit(5);
  console.log('\n--- dp_rincian (sample) ---');
  console.log(dps.map(d => ({ rincianLabel: d.rincianLabel, kategori: d.kategori })));
  
  process.exit(0);
}

main().catch(console.error);
