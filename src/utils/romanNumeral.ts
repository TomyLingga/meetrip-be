// ─── Roman Numeral Converter ──────────────────────────────────────────────────
// Digunakan untuk format nomor BTO/SPDK: 028/INL/BTO/VI/2026

const ROMAN = [
  [1, 'I'], [2, 'II'], [3, 'III'], [4, 'IV'],
  [5, 'V'], [6, 'VI'], [7, 'VII'], [8, 'VIII'],
  [9, 'IX'], [10, 'X'], [11, 'XI'], [12, 'XII'],
] as const

export function monthToRoman(month: number): string {
  const found = ROMAN.find(([m]) => m === month)
  if (!found) throw new Error(`Invalid month: ${month}`)
  return found[1]
}

export function padSequence(seq: number, length = 3): string {
  return String(seq).padStart(length, '0')
}

/**
 * Generate nomor dokumen: e.g. "028/INL/BTO/VI/2026"
 */
export function generateNomor(
  sequence: number,
  tipe: 'BTO' | 'SPDK',
  submittedAt: Date,
  company = 'INL',
): string {
  const month = monthToRoman(submittedAt.getMonth() + 1)
  const year  = submittedAt.getFullYear()
  return `${padSequence(sequence)}/${company}/${tipe}/${month}/${year}`
}
