require('dotenv').config();

const { Pool } = require('pg');

const rows = [
  ['0b6f1b8d-85d2-41e9-a443-2845a428f391', 'PERUSAHAAN', 'Transportasi Perusahaan', 'perusahaan'],
  ['8e0c0b8e-4ce6-478b-9db2-98b5228b6f4c', 'PUBLIK', 'Transportasi Publik', 'publik'],
  ['cdd7f9b2-fc99-4cd8-b0d7-0fe5f17a5b1f', 'PESAWAT', 'Pesawat', 'pesawat'],
];

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    for (const row of rows) {
      await pool.query(
        'insert into ref_transport (id,kode,label,tipe,is_active) values ($1,$2,$3,$4,true) on conflict (kode) do nothing',
        row,
      );
    }
    console.log('Master transport default dipastikan ada, tidak ada data yang dihapus.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
