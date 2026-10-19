# OSRM self-host — jarak jalan untuk BTO

MeeTrip menghitung **jarak penempatan → tujuan** lewat `travelDistance()` di
`src/services/geo.service.ts`:

| `OSRM_URL`             | Jarak yang dipakai                                   |
| ---------------------- | ---------------------------------------------------- |
| kosong (default)       | garis lurus (haversine), sama seperti sebelumnya     |
| diisi, rute ditemukan  | jarak jalan dari OSRM (data OpenStreetMap)           |
| diisi, rute gagal      | otomatis kembali ke garis lurus                      |

Rute gagal terjadi bila tujuan di luar cakupan data peta (mis. luar negeri,
atau pulau lain bila hanya memuat data Sumatera) atau server OSRM mati.

Geofence absen SPDK (radius meter dari titik tujuan) **tetap** garis lurus.

## Kebutuhan server

| Data                   | Ukuran .pbf | RAM saat proses | Cakupan                       |
| ---------------------- | ----------- | --------------- | ----------------------------- |
| `sumatra-latest`       | ± 280 MB    | ± 8 GB          | Pulau Sumatera                |
| `indonesia-latest`     | ± 1,7 GB    | ± 32 GB         | Seluruh Indonesia (+ feri)    |

Setelah diproses, server routing berjalan dengan RAM jauh lebih kecil
(± 1–2 GB untuk Sumatera). Proses bisa dilakukan di mesin lain lalu folder
`data/` disalin ke server.

## 1. Unduh data OpenStreetMap

```bash
cd deploy/osrm
mkdir -p data && cd data
curl -LO https://download.geofabrik.de/asia/indonesia/sumatra-latest.osm.pbf
cd ..
```

## 2. Proses data (sekali, ± 10–30 menit)

```bash
IMG=ghcr.io/project-osrm/osrm-backend:v5.27.1
docker run --rm -t -v "$PWD/data:/data" $IMG osrm-extract -p /opt/car.lua /data/sumatra-latest.osm.pbf
docker run --rm -t -v "$PWD/data:/data" $IMG osrm-partition /data/sumatra-latest.osrm
docker run --rm -t -v "$PWD/data:/data" $IMG osrm-customize /data/sumatra-latest.osrm
```

Untuk seluruh Indonesia, ganti `sumatra-latest` dengan `indonesia-latest`
(URL: `https://download.geofabrik.de/asia/indonesia-latest.osm.pbf`) di
perintah di atas dan di `docker-compose.yml`.

## 3. Jalankan server

```bash
docker compose up -d
# Uji: Head Office Medan → PKS Sei Mangkei (± 122 km lewat jalan)
curl "http://localhost:5000/route/v1/driving/98.6610596,3.5859991;99.3425704,3.1319965?overview=false"
```

## 4. Hubungkan ke MeeTrip

Di `.env` backend MeeTrip:

```
OSRM_URL=http://<host-osrm>:5000
```

Restart backend. `jarak_km` pada BTO baru akan memakai jarak jalan.
BTO lama tidak berubah.

## Pembaruan data (opsional)

Data jalan OSM terus diperbarui. Ulangi langkah 1–2 tiap beberapa bulan,
lalu `docker compose restart`.
