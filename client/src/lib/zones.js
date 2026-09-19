/**
 * Administrative Zones and Municipal Boundary Presets for Dhaka City / UrbanMend.
 */

export const MUNICIPAL_ZONES = [
  {
    id: 'all',
    nameEn: 'All City (Metropolitan)',
    nameBn: 'পুরো ঢাকা মহানগরী',
    badge: 'DMA',
    center: { lat: 23.7806, lng: 90.4152 },
    zoom: 12,
    bounds: [
      [23.680, 90.320],
      [23.900, 90.520],
    ],
    bbox: '90.320000,23.680000,90.520000,23.900000',
    polygon: null,
  },
  {
    id: 'dncc',
    nameEn: 'Dhaka North (DNCC)',
    nameBn: 'ঢাকা উত্তর সিটি কর্পোরেশন',
    badge: 'DNCC',
    center: { lat: 23.8200, lng: 90.3950 },
    zoom: 13,
    bounds: [
      [23.765, 90.330],
      [23.900, 90.450],
    ],
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
    badge: 'DSCC',
    center: { lat: 23.7250, lng: 90.4120 },
    zoom: 13,
    bounds: [
      [23.680, 90.355],
      [23.765, 90.445],
    ],
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
    nameEn: 'Zone 1: Uttara & Airport',
    nameBn: 'জোন ১: উত্তরা ও বিমানবন্দর',
    badge: 'Zone 1',
    center: { lat: 23.8728, lng: 90.3984 },
    zoom: 14,
    bounds: [
      [23.840, 90.370],
      [23.905, 90.430],
    ],
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
    nameEn: 'Zone 2: Mirpur & Pallabi',
    nameBn: 'জোন ২: মিরপুর ও পল্লবী',
    badge: 'Zone 2',
    center: { lat: 23.8071, lng: 90.3686 },
    zoom: 14,
    bounds: [
      [23.780, 90.340],
      [23.840, 90.390],
    ],
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
    nameEn: 'Zone 3: Gulshan & Banani',
    nameBn: 'জোন ৩: গুলশান, বনানী ও বারিধারা',
    badge: 'Zone 3',
    center: { lat: 23.7925, lng: 90.4078 },
    zoom: 14,
    bounds: [
      [23.770, 90.395],
      [23.815, 90.430],
    ],
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
    nameEn: 'Zone 4: Dhanmondi & Mohammadpur',
    nameBn: 'জোন ৪: ধানমন্ডি ও মোহাম্মদপুর',
    badge: 'Zone 4',
    center: { lat: 23.7465, lng: 90.3760 },
    zoom: 14,
    bounds: [
      [23.730, 90.350],
      [23.770, 90.390],
    ],
    bbox: '90.350000,23.730000,90.390000,23.770000',
    polygon: [
      [23.730, 90.350],
      [23.770, 90.350],
      [23.770, 90.390],
      [23.730, 90.390],
    ],
  },
  {
    id: 'zone_motijheel',
    nameEn: 'Zone 5: Motijheel & Ramna',
    nameBn: 'জোন ৫: মতিঝিল ও রমনা',
    badge: 'Zone 5',
    center: { lat: 23.7330, lng: 90.4090 },
    zoom: 14,
    bounds: [
      [23.715, 90.390],
      [23.750, 90.425],
    ],
    bbox: '90.390000,23.715000,90.425000,23.750000',
    polygon: [
      [23.715, 90.390],
      [23.750, 90.390],
      [23.750, 90.425],
      [23.715, 90.425],
    ],
  },
  {
    id: 'zone_old_dhaka',
    nameEn: 'Zone 6: Old Dhaka & Sadarghat',
    nameBn: 'জোন ৬: পুরান ঢাকা ও সদরঘাট',
    badge: 'Zone 6',
    center: { lat: 23.7099, lng: 90.4105 },
    zoom: 14,
    bounds: [
      [23.695, 90.390],
      [23.725, 90.430],
    ],
    bbox: '90.390000,23.695000,90.430000,23.725000',
    polygon: [
      [23.695, 90.390],
      [23.725, 90.390],
      [23.725, 90.430],
      [23.695, 90.430],
    ],
  },
  {
    id: 'zone_badda',
    nameEn: 'Zone 7: Badda & Rampura',
    nameBn: 'জোন ৭: বাড্ডা ও রামপুরা',
    badge: 'Zone 7',
    center: { lat: 23.7680, lng: 90.4280 },
    zoom: 14,
    bounds: [
      [23.745, 90.415],
      [23.790, 90.450],
    ],
    bbox: '90.415000,23.745000,90.450000,23.790000',
    polygon: [
      [23.745, 90.415],
      [23.790, 90.415],
      [23.790, 90.450],
      [23.745, 90.450],
    ],
  },
]

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
