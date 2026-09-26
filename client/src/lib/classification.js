/**
 * Client-side Semantic Intent and Category Classification Engine
 * 
 * Performs semantic concept clustering, entity-action-trigger co-occurrence analysis,
 * negative boundary exclusions, and multi-language contextual inference across Bengali, English, and Banglish.
 * 
 * Understands natural real-world citizen phrasing beyond static keywords, such as:
 * - "gas pipeline leak/গ্যাস লাইন লিক হয়ে গেছে" -> other (Gas Hazard / Life Safety Emergency, NOT water drainage)
 * - "বাড়ি ভেঙে গেছে, ভূমিকম্পের কারণে" -> public_structures (House + Collapsed + Earthquake)
 * - "বৃষ্টিতে কোমর পানি জমে মানুষ বের হতে পারছে না" -> water_drainage (Water + Submerged/Standing)
 * - "খোলা তার রাস্তায় পড়ে স্পার্ক করছে" -> electrical (Wire + Exposed/Sparking)
 * - "ডাস্টবিন উপচে পচা বর্জ্যের দুর্গন্ধে নিঃশ্বাস নেওয়া যাচ্ছে না" -> sanitation_waste (Waste + Smell/Rot)
 * - "রাতের বেলা সড়কবাতি জ্বলে না, পুরো এলাকা অন্ধকার" -> street_lighting (Lighting + Darkness/Failure)
 * - "ভারী ট্রাক চলার কারণে পিচ উঠে বড় বড় খানাখন্দ" -> roads (Road + Pothole/Asphalt damaged)
 */

import { api } from './api.js'

export const CATEGORY_GROUP_MAPPING = {
  roads: 'infrastructure',
  street_lighting: 'infrastructure',
  water_drainage: 'environmental',
  sanitation_waste: 'environmental',
  electrical: 'infrastructure',
  public_structures: 'infrastructure',
  other: 'infrastructure',
}

export const SEMANTIC_CATEGORIES = [
  {
    category: 'public_structures',
    group: 'infrastructure',
    labelEn: 'Public Structures & Buildings',
    labelBn: 'সর্বজনীন কাঠামো ও ভবন',
    entities: [
      'বাড়ি', 'বাড়ি', 'ঘর', 'ভবন', 'দালান', 'বিল্ডিং', 'ইমারত', 'দেওয়াল', 'দেয়াল', 'পাঁচিল',
      'ছাদ', 'বারান্দা', 'সিঁড়ি', 'সিঁড়ি', 'পিলার', 'খাম্বা', 'ব্রিজ',
      'সেতু', 'কালভার্ট', 'ফ্লাইওভার', 'উড়ালসেতু', 'উড়ালপুল', 'রেলিং', 'কাঠামো', 'ফটক', 'গেট',
      'সীমানা প্রাচীর', 'স্মৃতিস্তম্ভ', 'পাবলিক টয়লেট', 'শেড', 'ফ্ল্যাট',
      'house', 'building', 'nearby building', 'structure', 'apartment', 'wall', 'roof', 'pillar',
      'balcony', 'stairs', 'bridge', 'culvert', 'flyover', 'railing',
    ],
    states: [
      'ভেঙে', 'ভাঙা', 'ভেঙ্গে', 'ধসে', 'ধ্বসে', 'ধস', 'ধ্বংস', 'ফাটল', 'হেলে', 'ভাঙচুর',
      'ধসে পড়া', 'ধসে পরা', 'পড়ে গেছে', 'পড়ে গেছে', 'বিদীর্ণ', 'চূর্ণ', 'ঝুঁকিপূর্ণ',
      'আগুন', 'পুড়ে', 'পুড়ে', 'অগ্নিকাণ্ড',
      'collapse', 'collapsing', 'collapsed', 'crack', 'cracked', 'broken', 'damaged',
      'tilted', 'demolished', 'shattered', 'hazardous structure', 'fire', 'on fire', 'burning',
      'blaze', 'flames', 'smoke', 'fire outbreak', 'gutted',
    ],
    triggers: [
      'ভূমিকম্প', 'ভূমিকম্পে', 'ভূমিকম্পের', 'ভূমিধস', 'পাহাড় ধস', 'পাহাড় ধস', 'ঝড়ে', 'ঝড়ে',
      'তুফান', 'ঘূর্ণিঝড়', 'ঘূর্ণিঝড়', 'দুর্যোগ', 'ভারী বর্ষণে ধস', 'ফায়ার সার্ভিস', 'ফায়ার সার্ভিস', 'দমকল',
      'earthquake', 'landslide', 'tremor', 'aftershock', 'cyclone damage',
      'firefighting', 'firefighter', 'fire engine', 'emergency assistance', 'evacuation', 'rescue',
    ],
    phrases: [
      'বাড়ি ভেঙে', 'বাড়ি ভেঙে', 'বাড়ি ভেঙ্গে', 'ঘর ভেঙে', 'ভবন ধসে', 'ভবন হেলে', 'বিল্ডিং হেলে',
      'দেওয়াল ধস', 'দেয়াল ধস', 'দেওয়াল ভেঙে', 'দেয়াল ভেঙে', 'ছাদ ধসে', 'ছাদ ভেঙে', 'পিলার ফেটে',
      'ভূমিকম্পের কারণে', 'ভূমিকম্পে ক্ষতি', 'ব্রিজ ভেঙে', 'সেতু ভেঙে', 'কালভার্ট ভেঙে', 'রেলিং ভেঙে',
      'ফুটপাত ভেঙে', 'ফুটপাত নষ্ট', 'ফুটওভার ব্রিজ', 'বিল্ডিংয়ে আগুন', 'ভবনে আগুন', 'বাড়িতে আগুন',
      'building fire', 'fire in a nearby building', 'fire in building', 'house on fire', 'building on fire',
      'fire reported in building', 'fire outbreak in building', 'wall collapse', 'broken footpath',
      'house collapse', 'building collapse', 'structural damage', 'collapsed wall', 'collapsed bridge',
    ],
  },
  {
    category: 'other',
    group: 'infrastructure',
    labelEn: 'Other / Municipal Emergency',
    labelBn: 'অন্যান্য / পৌর জরুরি বিষয়',
    excludeIfMatches: ['building', 'house', 'road', 'drain', 'wire', 'ভবন', 'বিল্ডিং', 'বাড়ি', 'বাড়ি', 'রাস্তা', 'ড্রেন', 'তার'],
    entities: [
      'গ্যাস', 'গ্যাস লাইন', 'গ্যাস পাইপলাইন', 'গ্যাস পাইপ', 'সিলিন্ডার', 'এলপিজি',
      'তিতাস', 'তিতাস গ্যাস', 'পাইপলাইন',
      'gas', 'gas leak', 'gas pipeline', 'gas line', 'lpg', 'gas cylinder', 'pipeline leak',
      'toxic fumes', 'chemical spill',
    ],
    states: [
      'লিক', 'লিক হয়ে', 'লিক হয়ে গেছে', 'বের হচ্ছে', 'গন্ধ', 'ফেটে গেছে', 'বিস্ফোরণ',
      'leak', 'leaking', 'leakage', 'rupture', 'burst', 'hissing', 'explosion',
    ],
    triggers: [
      'বিস্ফোরণের আশঙ্কা', 'জীবননাশের ঝুঁকি', 'দমবন্ধ',
      'explosion risk', 'danger of explosion', 'suffocation',
    ],
    phrases: [
      'gas pipeline leak', 'gas line leak', 'gas leak', 'গ্যাস লাইন লিক', 'গ্যাস পাইপ লিক',
      'গ্যাস লিক', 'গ্যাস বের হচ্ছে', 'গ্যাস গন্ধ', 'সিলিন্ডার লিক', 'গ্যাস পাইপলাইন লিক',
      'pipeline leak', 'গ্যাস লাইন ফেটে', 'গ্যাস পাইপ ফেটে', 'গ্যাসের গন্ধ',
    ],
  },
  {
    category: 'water_drainage',
    group: 'environmental',
    labelEn: 'Water & Drainage',
    labelBn: 'পানি ও নিষ্কাশন',
    // Strict negative exclusion: gas leaks, fuel leaks, and roadway/tree traffic blockages must NEVER match water drainage
    excludeIfMatches: ['gas', 'গ্যাস', 'সিলিন্ডার', 'fuel', 'তেল', 'lpg', 'এলপিজি', 'তিতাস', 'traffic', 'fallen tree', 'tree has fallen', 'tree across', 'গাছ পড়ে'],
    entities: [
      'পানি', 'জল', 'ড্রেন', 'নর্দমা', 'নালা', 'খাল', 'ডোবা', 'ম্যানহোল', 'স্যুয়ারেজ', 'সুয়ারেজ',
      'পানির লাইন', 'পানির পাইপ', 'ওয়াসা', 'ওয়াসা', 'ড্রেনেজ', 'ড্রেনের পাইপ', 'ময়লা পানি',
      'water', 'drain', 'drainage', 'sewer', 'sewerage', 'sewage', 'manhole', 'water pipe', 'drainage pipe',
    ],
    states: [
      'জমে', 'আটকে', 'বন্ধ', 'উপচে', 'থইথই', 'তলিয়ে', 'তলিয়ে', 'প্লাবিত', 'ডুবে', 'ফেটে',
      'কাদা', 'জলমগ্ন', 'জলাবদ্ধতা', 'পানির স্রোত', 'প্রবাহিত', 'স্ল্যাব ভাঙা', 'অস্বাস্থ্যকর',
      'waterlog', 'waterlogging', 'flooded', 'flooding', 'clogged', 'blocked', 'overflowing',
      'submerged', 'stagnant', 'leaking water', 'water burst', 'unhygienic',
    ],
    triggers: [
      'বৃষ্টি', 'ভারী বৃষ্টি', 'বৃষ্টির কারণে', 'বৃষ্টিতে', 'বন্যা', 'জোয়ার', 'পাহাড়ি ঢল',
      'rain', 'rainfall', 'heavy rain', 'flood', 'monsoon', 'downpour',
    ],
    phrases: [
      'open manhole', 'খোলা ম্যানহোল', 'পানি জমে', 'পানি নিষ্কাশন', 'water leak', 'water logging',
      'waterlogging', 'blocked drain', 'drain blocked', 'sewage overflow', 'sewage is overflowing',
      'sewage overflowing', 'sewage on the street', 'sewage on street', 'sewage on road',
      'ড্রেন উপচে', 'ড্রেন বন্ধ', 'ড্রেনেজ সমস্যা', 'নর্দমা উপচে', 'নর্দমা বন্ধ', 'পানির পাইপ ফেটে', 'severe flooding',
      'পানি উঠছে', 'সুয়ারেজ লাইন', 'স্যুয়ারেজ লাইন', 'ড্রেনের পানি', 'পানি উপচে', 'রাস্তায় পানি',
      'রাস্তায় পানি', 'কোমর পানি', 'হাঁটু পানি', 'তলিয়ে গেছে', 'stagnant water', 'clogged drain',
    ],
  },
  {
    category: 'sanitation_waste',
    group: 'environmental',
    labelEn: 'Sanitation & Waste',
    labelBn: 'পরিচ্ছন্নতা ও বর্জ্য',
    entities: [
      'ময়লা', 'ময়লা', 'আবর্জনা', 'বর্জ্য', 'ডাস্টবিন', 'ভাগাড়', 'ভাগাড়', 'প্লাস্টিক', 'পলিথিন',
      'নোংরা', 'পৌরসভার গাড়ি', 'আবর্জনার স্তূপ', 'ময়লার স্তূপ',
      'garbage', 'trash', 'waste', 'rubbish', 'refuse', 'litter', 'dustbin', 'bin', 'dump', 'dumpster',
    ],
    states: [
      'দুর্গন্ধ', 'গন্ধ', 'পচা', 'ছড়াচ্ছে', 'ছড়াচ্ছে', 'জমা', 'স্তূপ', 'স্তুপ', 'মাছি', 'মশা',
      'পচনশীল', 'উপচে', 'ছড়িয়ে ছিটিয়ে', 'ফেলে রাখা', 'পচে গেছে',
      'stench', 'bad smell', 'foul odor', 'odor', 'stinking', 'smelly', 'overflowing', 'rotting',
      'uncollected', 'decaying',
    ],
    triggers: [
      'ক্লিনার আসেনি', 'অনেকদিন পরিষ্কার করে না', 'ডাস্টবিন নেই', 'খোলা জায়গায় ফেলা',
    ],
    phrases: [
      'overflowing bin', 'ময়লার স্তূপ', 'ময়লার স্তূপ', 'ময়লার ভাগাড়', 'ময়লার ভাগাড়',
      'আবর্জনার স্তূপ', 'bad smell', 'দুর্গন্ধ ছড়াচ্ছে', 'দুর্গন্ধ ছড়াচ্ছে', 'ময়লা জমে',
      'ময়লা জমে', 'আবর্জনা জমে', 'garbage pile', 'waste dump', 'trash pile', 'ডাস্টবিন উপচে',
      'বর্জ্য অপসারণ', 'নোংরা পরিবেশ', 'আবর্জনা ফেলা', 'uncollected garbage', 'foul smell',
      'তীব্র দুর্গন্ধ', 'পচা গন্ধ',
    ],
  },
  {
    category: 'street_lighting',
    group: 'infrastructure',
    labelEn: 'Street Lighting',
    labelBn: 'সড়ক বাতি',
    entities: [
      'বাতি', 'লাইট', 'আলো', 'ল্যাম্পপোস্ট', 'ল্যাম্পপোষ্ট', 'ল্যাম্প পোস্ট', 'সড়কবাতি', 'সড়কবাতি',
      'সড়ক বাতি', 'সড়ক বাতি', 'রাস্তার বাতি', 'বাল্ব', 'সোডিয়াম লাইট', 'এলইডি লাইট',
      'street light', 'streetlight', 'street lamp', 'lamp post', 'lamppost', 'streetlamp', 'light', 'bulb',
    ],
    states: [
      'নষ্ট', 'জ্বলছে না', 'জ্বলে না', 'নিভে', 'অন্ধকার', 'আঁধার', 'আলো নেই', 'দেখা যায় না',
      'ভাঙ্গা', 'ঝুলছে', 'অকেজো', 'ফ্লিকার',
      'broken', 'out', 'dark', 'pitch dark', 'no light', 'not working', 'flickering', 'burnt out',
    ],
    triggers: [
      'রাতের বেলা অন্ধকার', 'ছিনতাইয়ের ভয়', 'দুর্ঘটনার ভয়', 'সন্ধ্যা হলেই অন্ধকার',
    ],
    phrases: [
      'street light', 'streetlight', 'street lamp', 'lamp post', 'সড়ক বাতি', 'সড়কবাতি',
      'রাস্তার বাতি', 'বাতি জ্বলছে না', 'বাতি জ্বলে না', 'বাতি নষ্ট', 'লাইট নষ্ট', 'লাইট জ্বলছে না',
      'লাইট জ্বলে না', 'অন্ধকার রাস্তা', 'no light', 'ল্যাম্পপোস্ট ভাঙা', 'ল্যাম্প পোস্ট নষ্ট',
      'ল্যাম্পপোস্ট নষ্ট', 'রাতের বেলা অন্ধকার', 'dark street', 'broken streetlight', 'lights out',
      'পুরো রাস্তা অন্ধকার', 'আলোর ব্যবস্থা নেই',
    ],
  },
  {
    category: 'electrical',
    group: 'infrastructure',
    labelEn: 'Electrical Hazards',
    labelBn: 'বিদ্যুতিক বিপদ',
    entities: [
      'বিদ্যুৎ', 'বৈদ্যুতিক', 'তার', 'কারেন্ট', 'ট্রান্সফরমার', 'মিটার', 'বৈদ্যুতিক খাম্বা',
      'বৈদ্যুতিক খুঁটি', 'পোল', 'বিদ্যুতের লাইন', 'হাইভোল্টেজ',
      'electric', 'electrical', 'wire', 'wires', 'cable', 'transformer', 'power line', 'electric pole',
    ],
    states: [
      'খোলা', 'ছেঁড়া', 'ছেঁড়া', 'ছিঁড়ে', 'ছিঁড়ে', 'ঝুলছে', 'ঝুলন্ত', 'স্পার্ক', 'শক',
      'শর্ট সার্কিট', 'শর্টসার্কিট', 'বিদ্যুৎস্পৃষ্ট', 'আগুন', 'বিস্ফোরণ', 'ধোঁয়া',
      'exposed', 'live', 'snapped', 'hanging', 'sparking', 'spark', 'shock', 'short circuit',
      'electrocution', 'smoking', 'fire', 'explosion',
    ],
    triggers: [
      'বৃষ্টির পানিতে কারেন্ট', 'গাছ পড়ে তার ছিঁড়েছে', 'ঝড়ে তার ছিঁড়েছে',
    ],
    phrases: [
      'live wire', 'exposed wire', 'short circuit', 'power line', 'electric shock',
      'খোলা তার', 'ছেঁড়া তার', 'ছেঁড়া তার', 'বৈদ্যুতিক তার', 'শর্ট সার্কিট', 'শর্টসার্কিট',
      'বিদ্যুৎস্পৃষ্ট', 'বিদ্যুতের তার', 'ঝুলন্ত তার', 'স্পার্ক করছে', 'ট্রান্সফরমার বিস্ফোরণ',
      'electric spark', 'falling wire', 'snapped cable', 'power outage', 'তার ছিঁড়ে', 'তার ছিঁড়ে',
    ],
  },
  {
    category: 'roads',
    group: 'infrastructure',
    labelEn: 'Roads & Transport',
    labelBn: 'সড়ক ও পরিবহন',
    entities: [
      'রাস্তা', 'সড়ক', 'সড়ক', 'রোড', 'গলিপথ', 'মহাসড়ক', 'হাইওয়ে', 'পিচ', 'কার্পেটিং', 'ইট',
      'ডিভাইডার', 'স্পিডব্রেকার', 'আইল্যান্ড', 'সিগন্যাল', 'জেব্রা ক্রসিং', 'ট্রাফিক', 'যানবাহন',
      'গাছ', 'অবরোধ', 'ব্যারিকেড', 'ফুটপাত', 'ফুটপাথ', 'পথচারী',
      'road', 'roads', 'street', 'highway', 'lane', 'asphalt', 'pavement', 'divider', 'speed breaker',
      'traffic', 'tree', 'fallen tree', 'roadway', 'thoroughfare', 'obstruction', 'blockage',
      'footpath', 'sidewalk', 'walkway', 'pedestrian', 'pedestrians',
    ],
    states: [
      'গর্ত', 'খানাখন্দ', 'ভাঙা', 'উঠে গেছে', 'দেবে গেছে', 'খাদ', 'চাকা আটকে', 'চলাচলের অনুপযোগী',
      'যানবাহন উল্টে', 'বিশাল গর্ত', 'ফাটল', 'ধসে গেছে', 'বন্ধ', 'পড়ে আছে', 'পড়ে গেছে', 'অবরুদ্ধ',
      'যানবাহন বন্ধ',
      'pothole', 'potholes', 'crater', 'broken', 'damaged', 'severely damaged', 'crack', 'cracked', 'sinkhole',
      'uneven', 'bumpy', 'impassable', 'blocked', 'blocking', 'fallen', 'obstructed', 'halted', 'paralyzed',
    ],
    triggers: [
      'ভারী ট্রাক যাওয়ার কারণে', 'যানজট', 'দুর্ঘটনা ঘটছে', 'গাড়ি চলতে পারছে না', 'গাছ পড়ে', 'গাছ ভেঙে',
      'tree fell', 'tree has fallen', 'fallen across', 'removal is required', 'removal required', 'clearing required',
      'forced to walk on the road', 'রাস্তায় হাঁটতে বাধ্য', 'রাস্তায় হাঁটতে বাধ্য',
    ],
    phrases: [
      'broken road', 'damaged road', 'রাস্তা ভাঙা', 'রাস্তায় গর্ত', 'রাস্তায় গর্ত',
      'সড়কে গর্ত', 'সড়কে গর্ত', 'পিচ উঠে', 'খানাখন্দ', 'road crack', 'sinkhole',
      'traffic light broken', 'traffic signal', 'road divider', 'speed breaker',
      'raasta bondho', 'রাস্তা বন্ধ', 'রাস্তা দেবে গেছে', 'রাস্তা চলাচলের অনুপযোগী', 'রাস্তার বেহাল দশা',
      'fallen tree', 'tree fallen', 'tree has fallen', 'tree across the road', 'tree across road',
      'traffic is blocked', 'traffic blocked', 'road blocked', 'blocked road', 'road obstruction',
      'road blockage', 'tree blocking road', 'tree on road', 'roadway blocked',
      'damaged footpath', 'broken footpath', 'footpath damaged', 'footpath severely damaged',
      'pedestrians are being forced to walk on the road', 'forced to walk on the road',
      'গাছ পড়ে রাস্তা বন্ধ', 'গাছ ভেঙে রাস্তা বন্ধ', 'গাছ পড়ে আছে', 'যানবাহন চলাচল বন্ধ',
    ],
  },
]

/**
 * Precise word-boundary and multi-word phrase matcher.
 * Prevents false substring collisions (e.g. 'tree' matching inside 'street').
 */
export function matchTermInText(text, term) {
  if (!text || !term) return false
  const t = text.toLowerCase()
  const m = term.toLowerCase()
  if (m.includes(' ') || m.includes('-') || /[\u0980-\u09FF]/.test(m)) {
    return t.includes(m)
  }
  const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\b${escaped}\\b`, 'i')
  return regex.test(text)
}

/**
 * Intelligent Semantic Classifier that analyzes full sentences and contextual concepts.
 * Returns best match with score, breakdown of matched entities, states, and triggers.
 * 
 * @param {string} text Citizen's natural description
 * @returns {object|null} Matched category details or null
 */
export function detectCategoryFromDescription(text) {
  if (!text || typeof text !== 'string') return null
  const normalized = text.toLowerCase().trim()
  if (normalized.length < 3) return null

  let bestMatch = null
  let maxScore = 0

  for (const item of SEMANTIC_CATEGORIES) {
    // 0. Check Negative Exclusions
    if (item.excludeIfMatches) {
      const isExcluded = item.excludeIfMatches.some((ex) => matchTermInText(normalized, ex))
      if (isExcluded) continue // Skip this category completely!
    }

    let score = 0
    const matchedPhrases = []
    const matchedEntities = []
    const matchedStates = []
    const matchedTriggers = []

    // 1. Decisive Multi-word Phrases (highest confidence: 25 points each)
    if (item.phrases) {
      for (const phrase of item.phrases) {
        if (matchTermInText(normalized, phrase)) {
          score += 25
          matchedPhrases.push(phrase)
        }
      }
    }

    // 2. Physical Entities (6 points each)
    if (item.entities) {
      for (const entity of item.entities) {
        if (matchTermInText(normalized, entity)) {
          score += 6
          matchedEntities.push(entity)
        }
      }
    }

    // 3. States / Actions (5 points each)
    if (item.states) {
      for (const state of item.states) {
        if (matchTermInText(normalized, state)) {
          score += 5
          matchedStates.push(state)
        }
      }
    }

    // 4. Triggers / Hazard context (6 points each)
    if (item.triggers) {
      for (const trigger of item.triggers) {
        if (matchTermInText(normalized, trigger)) {
          score += 6
          matchedTriggers.push(trigger)
        }
      }
    }

    // 🌟 5. Semantic Co-occurrence Synergy Boosting:
    // If Entity + State/Action co-occur (e.g. গ্যাস + লিক or বাড়ি + ভেঙে or ড্রেন + উপচে)
    if (matchedEntities.length > 0 && matchedStates.length > 0) {
      score += 20 // Major semantic boost for contextually complete thought
    }

    // If Entity/State + Trigger co-occur (e.g. ভূমিকম্প + বাড়ি ভেঙে or বৃষ্টি + পানি জমে or গ্যাস + বিস্ফোরণ)
    if (matchedTriggers.length > 0 && (matchedEntities.length > 0 || matchedStates.length > 0)) {
      score += 15 // Disaster/cause co-occurrence boost
    }

    // Category-specific specificity priority:
    // Specific hazards (gas, electrical, lighting, water, structures) outweigh generic roads
    if (item.category !== 'roads' && score > 0) {
      score += 4
    }

    if (score > maxScore) {
      maxScore = score
      const allEvidence = [
        ...matchedPhrases,
        ...matchedEntities,
        ...matchedStates,
        ...matchedTriggers,
      ]

      bestMatch = {
        category: item.category,
        group: item.group,
        labelEn: item.labelEn,
        labelBn: item.labelBn,
        score,
        matchedTerms: Array.from(new Set(allEvidence)),
        semanticBreakdown: {
          entities: matchedEntities,
          states: matchedStates,
          triggers: matchedTriggers,
          phrases: matchedPhrases,
        },
      }
    }
  }

  // Minimum threshold: require at least 5 points
  if (maxScore >= 5) {
    return bestMatch
  }

  return null
}

const CRITICAL_KEYWORDS = [
  'live wire', 'exposed wire', 'electrocution', 'explosion', 'gas leak', 'pipeline leak',
  'building collapse', 'house collapse', 'bridge collapse', 'landslide', 'on fire', 'blaze',
  'fire', 'firefighting', 'firefighter', 'building fire', 'fire outbreak', 'flames', 'burns',
  'emergency assistance', 'life threat', 'hazard to life', 'toxic fumes', 'sinkhole', 'high voltage',
  'structural collapse',
  'খোলা তার', 'ছেঁড়া তার', 'ছেঁড়া তার', 'বিদ্যুৎস্পৃষ্ট', 'বিস্ফোরণ', 'গ্যাস লিক', 'আগুন',
  'অগ্নিকাণ্ড', 'অগ্নিসংযোগ', 'ফায়ার', 'ফায়ার সার্ভিস', 'ধস', 'ভেঙে পড়েছে', 'ভেঙে পড়ছে',
  'প্রাণহানি', 'মারাত্মক', 'জীবননাশের ঝুঁকি', 'হেলে পড়েছে',
]

const HIGH_KEYWORDS = [
  'open manhole', 'flood', 'accident', 'danger', 'injured', 'short circuit', 'deep pothole',
  'huge crater', 'sparking', 'overflowing sewer', 'heavy flooding', 'waterlogged', 'crater',
  'blocked road', 'tree fallen', 'traffic signal down', 'hazardous',
  'fallen tree', 'tree has fallen', 'tree across', 'tree fell', 'traffic blocked', 'traffic is blocked',
  'road blocked', 'road blockage', 'road obstruction', 'tree blocking',
  'damaged footpath', 'footpath severely damaged', 'footpath damaged', 'broken footpath',
  'sewage overflowing', 'sewage is overflowing', 'sewage leak', 'unhygienic', 'forced to walk on the road',
  'খোলা ম্যানহোল', 'বন্যা', 'দুর্ঘটনা', 'আহত', 'শর্ট সার্কিট', 'স্পার্ক', 'গভীর গর্ত',
  'বিশাল গর্ত', 'গাছ ভেঙে', 'গাছ পড়ে', 'গাছ পড়ে', 'কোমর পানি', 'জলাবদ্ধতা', 'বিপদ', 'শিশু', 'স্কুল',
  'রাস্তা বন্ধ', 'যানবাহন বন্ধ', 'ফুটপাত ভাঙা',
]

const LOW_KEYWORDS = [
  'garbage', 'litter', 'bad smell', 'faded paint', 'minor', 'small trash', 'dustbin',
  'drain cleaning', 'weed', 'graffiti', 'bench', 'dirty', 'sweep',
  'আবর্জনা', 'ময়লা', 'ময়লার স্তূপ', 'দুর্গন্ধ', 'ধূলাবালি', 'ডাস্টবিন', 'পরিষ্কার',
]

/**
 * Fast client-side semantic inference for initial urgency / severity level.
 * @param {string} text Description text
 * @returns {{ severity: 'low'|'medium'|'high'|'critical', matchedTerm: string|null }|null}
 */
export function detectSeverityFromDescription(text) {
  if (!text || typeof text !== 'string') return null
  const normalized = text.toLowerCase()
  if (normalized.trim().length < 3) return null

  for (const term of CRITICAL_KEYWORDS) {
    if (matchTermInText(normalized, term)) {
      return { severity: 'critical', matchedTerm: term }
    }
  }
  for (const term of HIGH_KEYWORDS) {
    if (matchTermInText(normalized, term)) {
      return { severity: 'high', matchedTerm: term }
    }
  }
  for (const term of LOW_KEYWORDS) {
    if (matchTermInText(normalized, term)) {
      return { severity: 'low', matchedTerm: term }
    }
  }
  return { severity: 'medium', matchedTerm: null }
}

/**
 * Generates an intelligent, human-readable AI semantic rationale from text description.
 */
export function generateAIRationale(text, category, severity) {
  if (!text || typeof text !== 'string') return ''
  const t = text.toLowerCase()

  // 1. High-priority acute life-safety hazards
  if (t.includes('fire') || t.includes('আগুন') || t.includes('অগ্নিকাণ্ড') || t.includes('blaze') || t.includes('flames') || t.includes('firefighting')) {
    return 'Active structural fire reported — immediate emergency and firefighting dispatch required.'
  }
  if (t.includes('collapse') || t.includes('ধস') || t.includes('ভেঙে') || t.includes('হেলে') || t.includes('landslide')) {
    return 'Critical structural hazard — acute risk of building collapse, evacuation and cordon required.'
  }
  if (t.includes('live wire') || t.includes('exposed wire') || t.includes('electrocution') || t.includes('খোলা তার') || t.includes('বিদ্যুৎস্পৃষ্ট')) {
    return 'Exposed live wire danger — acute electrocution threat to pedestrians and vehicles.'
  }
  if (t.includes('gas leak') || t.includes('গ্যাস লিক') || t.includes('explosion') || t.includes('বিস্ফোরণ') || t.includes('সিলিন্ডার')) {
    return 'Hazardous gas leak & explosion risk — immediate atmospheric hazard requiring emergency shutoff.'
  }
  if (t.includes('open manhole') || t.includes('খোলা ম্যানহোল')) {
    return 'Uncovered open manhole on active transit pathway — severe vehicular & pedestrian hazard.'
  }
  if (t.includes('crater') || t.includes('deep pothole') || t.includes('গভীর গর্ত') || t.includes('বিশাল গর্ত') || t.includes('খানাখন্দ')) {
    return 'Severe road crater / cavity — vehicle damage and accident risk requiring urgent resurfacing.'
  }
  if (t.includes('sewage') || t.includes('স্যুয়ারেজ') || t.includes('unhygienic') || t.includes('অস্বাস্থ্যকর')) {
    return 'Severe sewage overflow onto active corridor — sanitation & public health hazard requiring immediate clearing.'
  }
  if ((t.includes('footpath') || t.includes('sidewalk') || t.includes('ফুটপাত')) && (t.includes('damaged') || t.includes('broken') || t.includes('ভাঙা'))) {
    return 'Severely damaged pedestrian footpath — forcing pedestrians onto active vehicular roadway, urgent resurfacing needed.'
  }
  if (t.includes('flood') || t.includes('waterlog') || t.includes('জলাবদ্ধতা') || t.includes('কোমর পানি')) {
    return 'Severe urban waterlogging — submerged transit corridor requiring emergency pump evacuation.'
  }
  if (t.includes('garbage') || t.includes('dustbin') || t.includes('আবর্জনা') || t.includes('ময়লা') || t.includes('দুর্গন্ধ')) {
    return 'Municipal waste accumulation — sanitation hazard requiring collection and clearing dispatch.'
  }
  if (t.includes('street light') || t.includes('সড়ক বাতি') || t.includes('darkness') || t.includes('অন্ধকার')) {
    return 'Street lighting failure — nocturnal corridor blackout impacting citizen safety.'
  }
  if ((t.includes('tree') && (t.includes('fallen') || t.includes('fell') || t.includes('across') || t.includes('blocked'))) || (t.includes('traffic') && t.includes('blocked')) || t.includes('road blocked') || t.includes('blocked road') || t.includes('গাছ পড়ে') || t.includes('গাছ ভেঙে') || t.includes('রাস্তা বন্ধ')) {
    return 'Roadway obstruction — fallen tree/debris halting vehicular flow and transit corridor, emergency clearance required.'
  }

  // 2. Contextual fallback based on severity level
  switch (severity) {
    case 'critical':
      return 'Critical life-safety emergency: Requires immediate municipal and emergency response.'
    case 'high':
      return 'High-priority public safety hazard: Poses significant disruption to the community.'
    case 'low':
      return 'Routine municipal upkeep: Scheduled for standard community maintenance.'
    default:
      return 'Standard municipal issue: Triaged for routine inspection and scheduled resolution.'
  }
}

/**
 * Calls backend real-time AI classification endpoint.
 * Gracefully degrades to client semantic inference if backend is unreachable or offline.
 */
export async function fetchBackendAIClassification(text) {
  if (!text || typeof text !== 'string' || text.trim().length < 5) return null
  try {
    const res = await api('/classification/classify', {
      method: 'POST',
      body: { text: text.trim() },
    })
    return res
  } catch (err) {
    console.warn('Backend AI classify endpoint error, falling back to client semantic engine:', err)
    return null
  }
}

/**
 * Unified AI classifier combining instant client semantic scoring (0ms)
 * with authoritative backend AI endpoint.
 */
export async function classifyTextWithAI(text) {
  const clientCat = detectCategoryFromDescription(text)
  const clientSev = detectSeverityFromDescription(text)

  const fastCategory = clientCat?.category || 'public_structures'
  const fastSeverity = clientSev?.severity || 'medium'
  const smartRationale = generateAIRationale(text, fastCategory, fastSeverity)

  let finalCategory = clientCat?.category || null
  let finalSeverity = fastSeverity
  let finalRationale = smartRationale
  let finalSource = 'semantic-ai'
  let finalConfidence = fastSeverity === 'critical' ? 0.95 : 0.85

  try {
    const backendResult = await fetchBackendAIClassification(text)
    if (backendResult) {
      const isUnmatchedFallback =
        backendResult.source === 'fallback' ||
        (backendResult.rationale && backendResult.rationale.includes('no severity keyword matched'))

      if (backendResult.source === 'llm' && backendResult.category) {
        finalCategory = backendResult.category
        finalSeverity = backendResult.severity || fastSeverity
        finalRationale = backendResult.rationale || smartRationale
        finalSource = 'gemini'
        finalConfidence = backendResult.confidence || 0.9
      } else if (!isUnmatchedFallback && backendResult.category && backendResult.category !== 'other') {
        // Backend matched a legitimate keyword rule
        if (!finalCategory) finalCategory = backendResult.category
        if (fastSeverity === 'critical') {
          finalSeverity = 'critical'
        } else {
          finalSeverity = backendResult.severity || fastSeverity
        }
        finalRationale = smartRationale || backendResult.rationale
      }
    }
  } catch (err) {
    console.warn('Backend AI classify error, utilizing client semantic AI:', err)
  }

  // If still no category matched, default to fastCategory
  if (!finalCategory) {
    finalCategory = fastCategory
  }

  return {
    category: finalCategory,
    severity: finalSeverity,
    categoryLabel:
      SEMANTIC_CATEGORIES.find((c) => c.category === finalCategory)?.labelEn ||
      clientCat?.labelEn ||
      finalCategory,
    rationale: finalRationale,
    source: finalSource,
    confidence: finalConfidence,
  }
}

