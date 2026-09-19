/**
 * Administrative Cities, Metropolitan Zones, and Municipal Boundary Presets across Bangladesh.
 */

export const BANGLADESH_CITIES = [
  {
    id: 'dhaka',
    nameEn: 'Dhaka (ঢাকা)',
    nameBn: 'ঢাকা মহানগরী',
    division: 'Dhaka',
    center: { lat: 23.7806, lng: 90.4152 },
    zoom: 12,
    bounds: [
      [23.680, 90.320],
      [23.900, 90.520],
    ],
    bbox: '90.320000,23.680000,90.520000,23.900000',
    boundaryPolygon: [
      [23.890, 90.380],
      [23.880, 90.440],
      [23.820, 90.460],
      [23.740, 90.450],
      [23.690, 90.420],
      [23.700, 90.360],
      [23.750, 90.330],
      [23.820, 90.340],
      [23.890, 90.380],
    ],
    zones: [
      {
        id: 'dhaka_all',
        nameEn: 'Entire Dhaka Metro',
        nameBn: 'পুরো ঢাকা মহানগরী',
        center: { lat: 23.7806, lng: 90.4152 },
        zoom: 12,
        bounds: [[23.680, 90.320], [23.900, 90.520]],
        bbox: '90.320000,23.680000,90.520000,23.900000',
        polygon: null,
      },
      {
        id: 'dncc',
        nameEn: 'Dhaka North (DNCC)',
        nameBn: 'ঢাকা উত্তর সিটি কর্পোরেশন',
        center: { lat: 23.8200, lng: 90.3950 },
        zoom: 13,
        bounds: [[23.765, 90.330], [23.900, 90.450]],
        bbox: '90.330000,23.765000,90.450000,23.900000',
        polygon: [
          [23.765, 90.330],
          [23.830, 90.330],
          [23.900, 90.370],
          [23.900, 90.430],
          [23.840, 90.450],
          [23.775, 90.440],
          [23.765, 90.380],
        ],
      },
      {
        id: 'dscc',
        nameEn: 'Dhaka South (DSCC)',
        nameBn: 'ঢাকা দক্ষিণ সিটি কর্পোরেশন',
        center: { lat: 23.7250, lng: 90.4120 },
        zoom: 13,
        bounds: [[23.680, 90.355], [23.765, 90.445]],
        bbox: '90.355000,23.680000,90.445000,23.765000',
        polygon: [
          [23.765, 90.360],
          [23.765, 90.445],
          [23.710, 90.445],
          [23.680, 90.410],
          [23.690, 90.360],
          [23.730, 90.355],
        ],
      },
      {
        id: 'zone_uttara',
        nameEn: 'Uttara & Airport',
        nameBn: 'উত্তরা ও বিমানবন্দর',
        center: { lat: 23.8728, lng: 90.3984 },
        zoom: 14,
        bounds: [[23.840, 90.370], [23.905, 90.430]],
        bbox: '90.370000,23.840000,90.430000,23.905000',
        polygon: [
          [23.840, 90.370],
          [23.905, 90.370],
          [23.905, 90.430],
          [23.840, 90.430],
        ],
      },
      {
        id: 'zone_mirpur',
        nameEn: 'Mirpur & Pallabi',
        nameBn: 'মিরপুর ও পল্লবী',
        center: { lat: 23.8071, lng: 90.3686 },
        zoom: 14,
        bounds: [[23.780, 90.340], [23.840, 90.390]],
        bbox: '90.340000,23.780000,90.390000,23.840000',
        polygon: [
          [23.780, 90.340],
          [23.840, 90.340],
          [23.840, 90.390],
          [23.780, 90.390],
        ],
      },
      {
        id: 'zone_gulshan',
        nameEn: 'Gulshan & Banani',
        nameBn: 'গুলশান ও বনানী',
        center: { lat: 23.7925, lng: 90.4078 },
        zoom: 14,
        bounds: [[23.770, 90.395], [23.815, 90.430]],
        bbox: '90.395000,23.770000,90.430000,23.815000',
        polygon: [
          [23.770, 90.395],
          [23.815, 90.395],
          [23.815, 90.430],
          [23.770, 90.430],
        ],
      },
      {
        id: 'zone_dhanmondi',
        nameEn: 'Dhanmondi & Mohammadpur',
        nameBn: 'ধানমন্ডি ও মোহাম্মদপুর',
        center: { lat: 23.7465, lng: 90.3760 },
        zoom: 14,
        bounds: [[23.730, 90.350], [23.770, 90.390]],
        bbox: '90.350000,23.730000,90.390000,23.770000',
        polygon: [
          [23.730, 90.350],
          [23.770, 90.350],
          [23.770, 90.390],
          [23.730, 90.390],
        ],
      },
      {
        id: 'zone_old_dhaka',
        nameEn: 'Old Dhaka & Sadarghat',
        nameBn: 'পুরান ঢাকা ও সদরঘাট',
        center: { lat: 23.7099, lng: 90.4105 },
        zoom: 14,
        bounds: [[23.695, 90.390], [23.725, 90.430]],
        bbox: '90.390000,23.695000,90.430000,23.725000',
        polygon: [
          [23.695, 90.390],
          [23.725, 90.390],
          [23.725, 90.430],
          [23.695, 90.430],
        ],
      },
    ],
  },
  {
    id: 'chattogram',
    nameEn: 'Chattogram (চট্টগ্রাম)',
    nameBn: 'চট্টগ্রাম সিটি কর্পোরেশন',
    division: 'Chattogram',
    center: { lat: 22.3569, lng: 91.7832 },
    zoom: 12,
    bounds: [
      [22.250, 91.700],
      [22.450, 91.880],
    ],
    bbox: '91.700000,22.250000,91.880000,22.450000',
    boundaryPolygon: [
      [22.450, 91.760],
      [22.420, 91.860],
      [22.340, 91.870],
      [22.260, 91.830],
      [22.240, 91.770],
      [22.300, 91.720],
      [22.380, 91.740],
      [22.450, 91.760],
    ],
    zones: [
      {
        id: 'ctg_all',
        nameEn: 'Entire Chattogram City',
        nameBn: 'পুরো চট্টগ্রাম সিটি',
        center: { lat: 22.3569, lng: 91.7832 },
        zoom: 12,
        bounds: [[22.250, 91.700], [22.450, 91.880]],
        bbox: '91.700000,22.250000,91.880000,22.450000',
        polygon: null,
      },
      {
        id: 'ctg_agrabad',
        nameEn: 'Agrabad & Commercial Zone',
        nameBn: 'আগ্রাবাদ ও বাণিজ্যিক এলাকা',
        center: { lat: 22.3270, lng: 91.8120 },
        zoom: 14,
        bounds: [[22.310, 91.795], [22.345, 91.830]],
        bbox: '91.795000,22.310000,91.830000,22.345000',
        polygon: [
          [22.310, 91.795],
          [22.345, 91.795],
          [22.345, 91.830],
          [22.310, 91.830],
        ],
      },
      {
        id: 'ctg_gec',
        nameEn: 'Nasirabad & GEC Circle',
        nameBn: 'নাসিরাবাদ ও জিইসি মোড়',
        center: { lat: 22.3620, lng: 91.8210 },
        zoom: 14,
        bounds: [[22.345, 91.805], [22.380, 91.840]],
        bbox: '91.805000,22.345000,91.840000,22.380000',
        polygon: [
          [22.345, 91.805],
          [22.380, 91.805],
          [22.380, 91.840],
          [22.345, 91.840],
        ],
      },
      {
        id: 'ctg_panchlaish',
        nameEn: 'Panchlaish & Probortok',
        nameBn: 'পাঁচলাইশ ও প্রবর্তক',
        center: { lat: 22.3680, lng: 91.8380 },
        zoom: 14,
        bounds: [[22.350, 91.825], [22.385, 91.855]],
        bbox: '91.825000,22.350000,91.855000,22.385000',
        polygon: [
          [22.350, 91.825],
          [22.385, 91.825],
          [22.385, 91.855],
          [22.350, 91.855],
        ],
      },
      {
        id: 'ctg_patenga',
        nameEn: 'Patenga & Airport Area',
        nameBn: 'পতেঙ্গা ও বিমানবন্দর এলাকা',
        center: { lat: 22.2550, lng: 91.7950 },
        zoom: 13,
        bounds: [[22.230, 91.765], [22.285, 91.825]],
        bbox: '91.765000,22.230000,91.825000,22.285000',
        polygon: [
          [22.230, 91.765],
          [22.285, 91.765],
          [22.285, 91.825],
          [22.230, 91.825],
        ],
      },
      {
        id: 'ctg_halishahar',
        nameEn: 'Halishahar Housing',
        nameBn: 'হালিশহর আবাসিক এলাকা',
        center: { lat: 22.3250, lng: 91.7750 },
        zoom: 14,
        bounds: [[22.300, 91.750], [22.350, 91.795]],
        bbox: '91.750000,22.300000,91.795000,22.350000',
        polygon: [
          [22.300, 91.750],
          [22.350, 91.750],
          [22.350, 91.795],
          [22.300, 91.795],
        ],
      },
    ],
  },
  {
    id: 'rajshahi',
    nameEn: 'Rajshahi (রাজশাহী)',
    nameBn: 'রাজশাহী সিটি কর্পোরেশন',
    division: 'Rajshahi',
    center: { lat: 24.3745, lng: 88.6042 },
    zoom: 13,
    bounds: [
      [24.320, 88.520],
      [24.420, 88.680],
    ],
    bbox: '88.520000,24.320000,88.680000,24.420000',
    boundaryPolygon: [
      [24.420, 88.580],
      [24.410, 88.650],
      [24.370, 88.680],
      [24.340, 88.630],
      [24.330, 88.560],
      [24.360, 88.530],
      [24.420, 88.580],
    ],
    zones: [
      {
        id: 'raj_all',
        nameEn: 'Entire Rajshahi City',
        nameBn: 'পুরো রাজশাহী সিটি',
        center: { lat: 24.3745, lng: 88.6042 },
        zoom: 13,
        bounds: [[24.320, 88.520], [24.420, 88.680]],
        bbox: '88.520000,24.320000,88.680000,24.420000',
        polygon: null,
      },
      {
        id: 'raj_boalia',
        nameEn: 'Boalia & Shaheb Bazar',
        nameBn: 'বোয়ালিয়া ও সাহেব বাজার',
        center: { lat: 24.3680, lng: 88.6020 },
        zoom: 14,
        bounds: [[24.350, 88.585], [24.385, 88.620]],
        bbox: '88.585000,24.350000,88.620000,24.385000',
        polygon: [
          [24.350, 88.585],
          [24.385, 88.585],
          [24.385, 88.620],
          [24.350, 88.620],
        ],
      },
      {
        id: 'raj_motihar',
        nameEn: 'Motihar & Rajshahi University',
        nameBn: 'মতিহার ও বিশ্ববিদ্যালয় এলাকা',
        center: { lat: 24.3690, lng: 88.6380 },
        zoom: 14,
        bounds: [[24.355, 88.620], [24.390, 88.665]],
        bbox: '88.620000,24.355000,88.665000,24.390000',
        polygon: [
          [24.355, 88.620],
          [24.390, 88.620],
          [24.390, 88.665],
          [24.355, 88.665],
        ],
      },
      {
        id: 'raj_rajpara',
        nameEn: 'Rajpara & Laxmipur',
        nameBn: 'রাজপাড়া ও লক্ষ্মীপুর',
        center: { lat: 24.3760, lng: 88.5820 },
        zoom: 14,
        bounds: [[24.360, 88.560], [24.395, 88.600]],
        bbox: '88.560000,24.360000,88.600000,24.395000',
        polygon: [
          [24.360, 88.560],
          [24.395, 88.560],
          [24.395, 88.600],
          [24.360, 88.600],
        ],
      },
      {
        id: 'raj_shahmakhdum',
        nameEn: 'Shah Makhdum & Airport',
        nameBn: 'শাহ মখদুম ও বিমানবন্দর এলাকা',
        center: { lat: 24.4120, lng: 88.6180 },
        zoom: 14,
        bounds: [[24.390, 88.595], [24.435, 88.645]],
        bbox: '88.595000,24.390000,88.645000,24.435000',
        polygon: [
          [24.390, 88.595],
          [24.435, 88.595],
          [24.435, 88.645],
          [24.390, 88.645],
        ],
      },
    ],
  },
  {
    id: 'khulna',
    nameEn: 'Khulna (খুলনা)',
    nameBn: 'খুলনা সিটি কর্পোরেশন',
    division: 'Khulna',
    center: { lat: 22.8456, lng: 89.5403 },
    zoom: 13,
    bounds: [
      [22.780, 89.480],
      [22.920, 89.600],
    ],
    bbox: '89.480000,22.780000,89.600000,22.920000',
    boundaryPolygon: [
      [22.920, 89.520],
      [22.900, 89.580],
      [22.830, 89.590],
      [22.790, 89.550],
      [22.800, 89.500],
      [22.860, 89.490],
      [22.920, 89.520],
    ],
    zones: [
      {
        id: 'khulna_all',
        nameEn: 'Entire Khulna City',
        nameBn: 'পুরো খুলনা সিটি',
        center: { lat: 22.8456, lng: 89.5403 },
        zoom: 13,
        bounds: [[22.780, 89.480], [22.920, 89.600]],
        bbox: '89.480000,22.780000,89.600000,22.920000',
        polygon: null,
      },
      {
        id: 'khulna_sonadanga',
        nameEn: 'Sonadanga & Bus Terminal',
        nameBn: 'সোনাডাঙ্গা এলাকা',
        center: { lat: 22.8250, lng: 89.5380 },
        zoom: 14,
        bounds: [[22.805, 89.515], [22.845, 89.555]],
        bbox: '89.515000,22.805000,89.555000,22.845000',
        polygon: [
          [22.805, 89.515],
          [22.845, 89.515],
          [22.845, 89.555],
          [22.805, 89.555],
        ],
      },
      {
        id: 'khulna_khalishpur',
        nameEn: 'Khalishpur Industrial Zone',
        nameBn: 'খালিশপুর শিল্প এলাকা',
        center: { lat: 22.8620, lng: 89.5320 },
        zoom: 14,
        bounds: [[22.845, 89.510], [22.885, 89.550]],
        bbox: '89.510000,22.845000,89.550000,22.885000',
        polygon: [
          [22.845, 89.510],
          [22.885, 89.510],
          [22.885, 89.550],
          [22.845, 89.550],
        ],
      },
    ],
  },
  {
    id: 'sylhet',
    nameEn: 'Sylhet (সিলেট)',
    nameBn: 'সিলেট সিটি কর্পোরেশন',
    division: 'Sylhet',
    center: { lat: 24.8949, lng: 91.8687 },
    zoom: 13,
    bounds: [
      [24.840, 91.800],
      [24.960, 91.940],
    ],
    bbox: '91.800000,24.840000,91.940000,24.960000',
    boundaryPolygon: [
      [24.960, 91.860],
      [24.940, 91.920],
      [24.880, 91.930],
      [24.850, 91.880],
      [24.850, 91.820],
      [24.900, 91.810],
      [24.960, 91.860],
    ],
    zones: [
      {
        id: 'sylhet_all',
        nameEn: 'Entire Sylhet City',
        nameBn: 'পুরো সিলেট সিটি',
        center: { lat: 24.8949, lng: 91.8687 },
        zoom: 13,
        bounds: [[24.840, 91.800], [24.960, 91.940]],
        bbox: '91.800000,24.840000,91.940000,24.960000',
        polygon: null,
      },
      {
        id: 'sylhet_zindabazar',
        nameEn: 'Zindabazar & Chowhatta',
        nameBn: 'জিন্দাবাজার ও চৌহাট্টা',
        center: { lat: 24.8980, lng: 91.8710 },
        zoom: 14,
        bounds: [[24.880, 91.855], [24.915, 91.885]],
        bbox: '91.855000,24.880000,91.885000,24.915000',
        polygon: [
          [24.880, 91.855],
          [24.915, 91.855],
          [24.915, 91.885],
          [24.880, 91.885],
        ],
      },
      {
        id: 'sylhet_uposhohor',
        nameEn: 'Shahjalal Uposhohor',
        nameBn: 'শাহজালাল উপশহর',
        center: { lat: 24.8850, lng: 91.8880 },
        zoom: 14,
        bounds: [[24.870, 91.870], [24.905, 91.905]],
        bbox: '91.870000,24.870000,91.905000,24.905000',
        polygon: [
          [24.870, 91.870],
          [24.905, 91.870],
          [24.905, 91.905],
          [24.870, 91.905],
        ],
      },
    ],
  },
  {
    id: 'barishal',
    nameEn: 'Barishal (বরিশাল)',
    nameBn: 'বরিশাল সিটি কর্পোরেশন',
    division: 'Barishal',
    center: { lat: 22.7010, lng: 90.3535 },
    zoom: 13,
    bounds: [
      [22.650, 90.300],
      [22.760, 90.410],
    ],
    bbox: '90.300000,22.650000,90.410000,22.760000',
    boundaryPolygon: [
      [22.760, 90.340],
      [22.740, 90.390],
      [22.680, 90.390],
      [22.660, 90.330],
      [22.700, 90.310],
      [22.760, 90.340],
    ],
    zones: [
      {
        id: 'barishal_all',
        nameEn: 'Entire Barishal City',
        nameBn: 'পুরো বরিশাল সিটি',
        center: { lat: 22.7010, lng: 90.3535 },
        zoom: 13,
        bounds: [[22.650, 90.300], [22.760, 90.410]],
        bbox: '90.300000,22.650000,90.410000,22.760000',
        polygon: null,
      },
    ],
  },
  {
    id: 'rangpur',
    nameEn: 'Rangpur (রংপুর)',
    nameBn: 'রংপুর সিটি কর্পোরেশন',
    division: 'Rangpur',
    center: { lat: 25.7439, lng: 89.2752 },
    zoom: 13,
    bounds: [
      [25.690, 89.200],
      [25.800, 89.340],
    ],
    bbox: '89.200000,25.690000,89.340000,25.800000',
    boundaryPolygon: [
      [25.800, 89.260],
      [25.770, 89.320],
      [25.710, 89.310],
      [25.700, 89.230],
      [25.750, 89.220],
      [25.800, 89.260],
    ],
    zones: [
      {
        id: 'rangpur_all',
        nameEn: 'Entire Rangpur City',
        nameBn: 'পুরো রংপুর সিটি',
        center: { lat: 25.7439, lng: 89.2752 },
        zoom: 13,
        bounds: [[25.690, 89.200], [25.800, 89.340]],
        bbox: '89.200000,25.690000,89.340000,25.800000',
        polygon: null,
      },
    ],
  },
  {
    id: 'mymensingh',
    nameEn: 'Mymensingh (ময়মনসিংহ)',
    nameBn: 'ময়মনসিংহ সিটি কর্পোরেশন',
    division: 'Mymensingh',
    center: { lat: 24.7471, lng: 90.4203 },
    zoom: 13,
    bounds: [
      [24.700, 90.360],
      [24.800, 90.480],
    ],
    bbox: '90.360000,24.700000,90.480000,24.800000',
    boundaryPolygon: [
      [24.800, 90.410],
      [24.770, 90.460],
      [24.710, 90.450],
      [24.710, 90.380],
      [24.760, 90.370],
      [24.800, 90.410],
    ],
    zones: [
      {
        id: 'mymensingh_all',
        nameEn: 'Entire Mymensingh City',
        nameBn: 'পুরো ময়মনসিংহ সিটি',
        center: { lat: 24.7471, lng: 90.4203 },
        zoom: 13,
        bounds: [[24.700, 90.360], [24.800, 90.480]],
        bbox: '90.360000,24.700000,90.480000,24.800000',
        polygon: null,
      },
    ],
  },
  {
    id: 'gazipur',
    nameEn: 'Gazipur (গাজীপুর)',
    nameBn: 'গাজীপুর সিটি কর্পোরেশন',
    division: 'Dhaka',
    center: { lat: 23.9999, lng: 90.4203 },
    zoom: 12,
    bounds: [
      [23.900, 90.320],
      [24.100, 90.520],
    ],
    bbox: '90.320000,23.900000,90.520000,24.100000',
    boundaryPolygon: [
      [24.100, 90.400],
      [24.080, 90.480],
      [23.940, 90.490],
      [23.910, 90.390],
      [23.980, 90.340],
      [24.100, 90.400],
    ],
    zones: [
      {
        id: 'gazipur_all',
        nameEn: 'Entire Gazipur City',
        nameBn: 'পুরো গাজীপুর সিটি',
        center: { lat: 23.9999, lng: 90.4203 },
        zoom: 12,
        bounds: [[23.900, 90.320], [24.100, 90.520]],
        bbox: '90.320000,23.900000,90.520000,24.100000',
        polygon: null,
      },
    ],
  },
  {
    id: 'cumilla',
    nameEn: 'Cumilla (কুমিল্লা)',
    nameBn: 'কুমিল্লা সিটি কর্পোরেশন',
    division: 'Chattogram',
    center: { lat: 23.4607, lng: 91.1809 },
    zoom: 13,
    bounds: [
      [23.400, 91.120],
      [23.520, 91.240],
    ],
    bbox: '91.120000,23.400000,91.240000,23.520000',
    boundaryPolygon: [
      [23.520, 91.170],
      [23.500, 91.220],
      [23.430, 91.230],
      [23.410, 91.160],
      [23.460, 91.140],
      [23.520, 91.170],
    ],
    zones: [
      {
        id: 'cumilla_all',
        nameEn: 'Entire Cumilla City',
        nameBn: 'পুরো কুমিল্লা সিটি',
        center: { lat: 23.4607, lng: 91.1809 },
        zoom: 13,
        bounds: [[23.400, 91.120], [23.520, 91.240]],
        bbox: '91.120000,23.400000,91.240000,23.520000',
        polygon: null,
      },
    ],
  },
]

// Backward-compatible alias for default Dhaka zones
export const MUNICIPAL_ZONES = BANGLADESH_CITIES[0].zones

/**
 * Converts an array of [lat, lng] vertices into a valid GeoJSON MultiPolygon payload
 * suitable for PUT /api/v1/meta/city-boundary.
 */
export function pointsToGeoJsonMultiPolygon(latLngPoints) {
  if (!Array.isArray(latLngPoints) || latLngPoints.length < 3) return null
  // Convert [lat, lng] to [lng, lat] for GeoJSON standard
  const ring = latLngPoints.map(([lat, lng]) => [
    Number(lng.toFixed(6)),
    Number(lat.toFixed(6)),
  ])
  // Ensure the polygon ring is closed (first point == last point)
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first])
  }
  return {
    type: 'MultiPolygon',
    coordinates: [[ring]],
  }
}

/** Compute bounding box string "minLng,minLat,maxLng,maxLat" from points. */
export function boundsFromPoints(points) {
  if (!points || points.length === 0) return null
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }
  return {
    bounds: [[minLat, minLng], [maxLat, maxLng]],
    bbox: `${minLng.toFixed(6)},${minLat.toFixed(6)},${maxLng.toFixed(6)},${maxLat.toFixed(6)}`,
  }
}

/** Calculate great-circle distance between two coordinates in meters. */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

/**
 * Ray-casting algorithm to test if a point { lat, lng } is inside a polygon [[lat, lng], ...].
 */
export function isPointInPolygon(point, polygonPoints) {
  if (!point || !Array.isArray(polygonPoints) || polygonPoints.length < 3) return false
  const lat = typeof point.lat === 'function' ? point.lat() : Number(point.lat)
  const lng = typeof point.lng === 'function' ? point.lng() : Number(point.lng)
  if (isNaN(lat) || isNaN(lng)) return false

  let inside = false
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const [latI, lngI] = polygonPoints[i]
    const [latJ, lngJ] = polygonPoints[j]

    const intersect =
      latI > lat !== latJ > lat &&
      lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI
    if (intersect) inside = !inside
  }
  return inside
}
