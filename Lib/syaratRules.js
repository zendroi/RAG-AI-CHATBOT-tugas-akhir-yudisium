const rules = {
  tugasAkhir: {
    label: 'pengambilan Tugas Akhir',
    numeric: [
      { field: 'sks', label: 'Jumlah SKS yang sudah ditempuh', min: 120, unit: ' SKS' },
      { field: 'ipk', label: 'IPK', min: 2.0, unit: '' }
    ],
    boolean: [
      { field: 'lulusPrasyarat', label: 'Sudah lulus seluruh mata kuliah prasyarat TA' }
    ]
  },
  sidangTA: {
    label: 'sidang Tugas Akhir',
    numeric: [
      { field: 'jumlahBimbingan', label: 'Jumlah bimbingan dengan dosen pembimbing', min: 8, unit: ' kali' },
      { field: 'similarity', label: 'Persentase similarity (Turnitin/iThenticate)', max: 30, unit: '%' }
    ],
    boolean: [
      { field: 'pembimbingApproved', label: 'Sudah disetujui dosen pembimbing untuk sidang' },
      { field: 'administrasiLengkap', label: 'Administrasi sidang sudah lengkap' }
    ]
  },
  yudisium: {
    label: 'yudisium',
    numeric: [
      { field: 'sksTersisa', label: 'Sisa SKS yang belum lulus', max: 0, unit: ' SKS' },
      { field: 'ipk', label: 'IPK', min: 2.0, unit: '' }
    ],
    boolean: [
      { field: 'laporanTaDisahkan', label: 'Laporan TA sudah disahkan pembimbing' },
      { field: 'bebasAdministrasi', label: 'Sudah bebas tanggungan administrasi' },
      { field: 'bebasPustaka', label: 'Sudah bebas pustaka' }
    ]
  }
};

function evaluate(jenis, status = {}) {
  const rule = rules[jenis];
  if (!rule) throw new Error('Jenis pengecekan tidak dikenal.');

  const missing = [];

  for (const item of rule.numeric) {
    const raw = status[item.field];
    const value = Number(raw);
    if (raw === undefined || raw === null || raw === '' || Number.isNaN(value)) {
      missing.push({ field: item.field, requirement: item.label, currentValue: '-' });
      continue;
    }
    if (item.min !== undefined && value < item.min) {
      missing.push({
        field: item.field,
        requirement: `${item.label} minimal ${item.min}${item.unit}`,
        currentValue: `${value}${item.unit}`
      });
    }
    if (item.max !== undefined && value > item.max) {
      missing.push({
        field: item.field,
        requirement: `${item.label} maksimal ${item.max}${item.unit}`,
        currentValue: `${value}${item.unit}`
      });
    }
  }

  for (const item of rule.boolean) {
    if (!status[item.field]) {
      missing.push({ field: item.field, requirement: item.label, currentValue: 'Belum' });
    }
  }

  return { eligible: missing.length === 0, missing };
}

module.exports = { rules, evaluate };
