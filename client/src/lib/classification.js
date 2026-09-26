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
  other: 'environmental',
}

export const SEMANTIC_CATEGORIES = [
  {
    category: 'other',
    group: 'environmental',
    labelEn: 'Other / Hazardous Gas & Emergency',
    labelBn: 'অন্যান্য / গ্যাস লাইন ও জরুরি বিপদ',
    entities: [
      'গ্যাস', 'গ্যাস লাইন', 'গ্যাস পাইপলাইন', 'গ্যাস পাইপ', 'সিলিন্ডার', 'এলপিজি',
      'তিতাস', 'তিতাস গ্যাস', 'পাইপলাইন',
      'gas', 'gas leak', 'gas pipeline', 'gas line', 'lpg', 'gas cylinder', 'pipeline leak',
      'toxic fumes', 'chemical spill', 'fire', 'আগুন', 'অগ্নিকাণ্ড',
    ],
    states: [
      'লিক', 'লিক হয়ে', 'লিক হয়ে গেছে', 'বের হচ্ছে', 'গন্ধ', 'ফেটে গেছে', 'আগুন', 'বিস্ফোরণ',
      'leak', 'leaking', 'leakage', 'rupture', 'burst', 'hissing', 'explosion', 'blaze',
    ],
    triggers: [
      'আগুন লাগার ভয়', 'বিস্ফোরণের আশঙ্কা', 'জীবননাশের ঝুঁকি', 'দমবন্ধ',
      'explosion risk', 'fire hazard', 'danger of explosion', 'suffocation',
    ],
    phrases: [
      'gas pipeline leak', 'gas line leak', 'gas leak', 'গ্যাস লাইন লিক', 'গ্যাস পাইপ লিক',
      'গ্যাস লিক', 'গ্যাস বের হচ্ছে', 'গ্যাস গন্ধ', 'সিলিন্ডার লিক', 'গ্যাস পাইপলাইন লিক',
      'pipeline leak', 'গ্যাস লাইন ফেটে', 'গ্যাস পাইপ ফেটে', 'গ্যাসের গন্ধ',
    ],
  },
  {
    category: 'public_structures',
    group: 'infrastructure',
    labelEn: 'Public Structures & Buildings',
    labelBn: 'সর্বজনীন কাঠামো ও ভবন',
    entities: [
      'বাড়ি', 'বাড়ি', 'ঘর', 'ভবন', 'দালান', 'বিল্ডিং', 'ইমারত', 'দেওয়াল', 'দেয়াল', 'পাঁচিল',
      'ছাদ', 'বারান্দা', 'সিঁড়ি', 'সিঁড়ি', 'পিলার', 'খাম্বা', 'ফুটপাত', 'ফুটপাথ', 'ব্রিজ',
      'সেতু', 'কালভার্ট', 'ফ্লাইওভার', 'উড়ালসেতু', 'উড়ালপুল', 'রেলিং', 'কাঠামো', 'ফটক', 'গেট',
      'সীমানা প্রাচীর', 'স্মৃতিস্তম্ভ', 'পাবলিক টয়লেট', 'পাবলিক টয়লেট', 'শেড',
      'house', 'building', 'structure', 'wall', 'roof', 'pillar', 'balcony', 'stairs',
      'footpath', 'sidewalk', 'bridge', 'culvert', 'flyover', 'railing', 'pavement',
    ],
    states: [
      'ভেঙে', 'ভাঙা', 'ভেঙ্গে', 'ধসে', 'ধ্বসে', 'ধস', 'ধ্বংস', 'ফাটল', 'হেলে', 'ভাঙচুর',
      'ধসে পড়া', 'ধসে পরা', 'পড়ে গেছে', 'পড়ে গেছে', 'বিদীর্ণ', 'চূর্ণ', 'ঝুঁকিপূর্ণ',
      'collapse', 'collapsing', 'collapsed', 'crack', 'cracked', 'broken', 'damaged',
      'tilted', 'demolished', 'shattered', 'hazardous structure',
    ],
    triggers: [
      'ভূমিকম্প', 'ভূমিকম্পে', 'ভূমিকম্পের', 'ভূমিধস', 'পাহাড় ধস', 'পাহাড় ধস', 'ঝড়ে', 'ঝড়ে',
      'তুফান', 'ঘূর্ণিঝড়', 'ঘূর্ণিঝড়', 'দুর্যোগ', 'ভারী বর্ষণে ধস',
      'earthquake', 'landslide', 'tremor', 'aftershock', 'cyclone damage',
    ],
    phrases: [
      'বাড়ি ভেঙে', 'বাড়ি ভেঙে', 'বাড়ি ভেঙ্গে', 'ঘর ভেঙে', 'ভবন ধসে', 'ভবন হেলে', 'বিল্ডিং হেলে',
      'দেওয়াল ধস', 'দেয়াল ধস', 'দেওয়াল ভেঙে', 'দেয়াল ভেঙে', 'ছাদ ধসে', 'ছাদ ভেঙে', 'পিলার ফেটে',
      'ভূমিকম্পের কারণে', 'ভূমিকম্পে ক্ষতি', 'ব্রিজ ভেঙে', 'সেতু ভেঙে', 'কালভার্ট ভেঙে', 'রেলিং ভেঙে',
      'ফুটপাত ভেঙে', 'ফুটপাত নষ্ট', 'ফুটওভার ব্রিজ', 'wall collapse', 'broken footpath', 'house collapse',
      'building collapse', 'structural damage', 'collapsed wall', 'collapsed bridge',
    ],
  },
  {
    category: 'water_drainage',
    group: 'environmental',
    labelEn: 'Water & Drainage',
    labelBn: 'পানি ও নিষ্কাশন',
    // Strict negative exclusion: gas leaks, fuel leaks must NEVER match water drainage
    excludeIfMatches: ['gas', 'গ্যাস', 'সিলিন্ডার', 'fuel', 'তেল', 'lpg', 'এলপিজি', 'তিতাস'],
    entities: [
      'পানি', 'জল', 'ড্রেন', 'নর্দমা', 'নালা', 'খাল', 'ডোবা', 'ম্যানহোল', 'স্যুয়ারেজ', 'সুয়ারেজ',
      'পানির লাইন', 'পানির পাইপ', 'ওয়াসা', 'ওয়াসা', 'ড্রেনেজ', 'ড্রেনের পাইপ',
      'water', 'drain', 'drainage', 'sewer', 'sewerage', 'manhole', 'water pipe', 'drainage pipe',
    ],
    states: [
      'জমে', 'আটকে', 'বন্ধ', 'উপচে', 'থইথই', 'তলিয়ে', 'তলিয়ে', 'প্লাবিত', 'ডুবে', 'ফেটে',
      'কাদা', 'জলমগ্ন', 'জলাবদ্ধতা', 'পানির স্রোত', 'প্রবাহিত', 'স্ল্যাব ভাঙা',
      'waterlog', 'waterlogging', 'flooded', 'flooding', 'clogged', 'blocked', 'overflowing',
      'submerged', 'stagnant', 'leaking water', 'water burst',
    ],
    triggers: [
      'বৃষ্টি', 'ভারী বৃষ্টি', 'বৃষ্টির কারণে', 'বৃষ্টিতে', 'বন্যা', 'জোয়ার', 'পাহাড়ি ঢল',
      'rain', 'rainfall', 'heavy rain', 'flood', 'monsoon', 'downpour',
    ],
    phrases: [
      'open manhole', 'খোলা ম্যানহোল', 'পানি জমে', 'পানি নিষ্কাশন', 'water leak', 'water logging',
      'waterlogging', 'blocked drain', 'drain blocked', 'sewage overflow', 'ড্রেন উপচে',
      'ড্রেন বন্ধ', 'ড্রেনেজ সমস্যা', 'নর্দমা উপচে', 'নর্দমা বন্ধ', 'পানির পাইপ ফেটে', 'severe flooding',
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
      'ডিভাইডার', 'স্পিডব্রেকার', 'আইল্যান্ড', 'সিগন্যাল', 'জেব্রা ক্রসিং',
      'road', 'roads', 'street', 'highway', 'lane', 'asphalt', 'pavement', 'divider', 'speed breaker',
    ],
    states: [
      'গর্ত', 'খানাখন্দ', 'ভাঙা', 'উঠে গেছে', 'দেবে গেছে', 'খাদ', 'চাকা আটকে', 'চলাচলের অনুপযোগী',
      'যানবাহন উল্টে', 'বিশাল গর্ত', 'ফাটল', 'ধসে গেছে',
      'pothole', 'potholes', 'crater', 'broken', 'damaged', 'crack', 'cracked', 'sinkhole',
      'uneven', 'bumpy', 'impassable',
    ],
    triggers: [
      'ভারী ট্রাক যাওয়ার কারণে', 'যানজট', 'দুর্ঘটনা ঘটছে', 'গাড়ি চলতে পারছে না',
    ],
    phrases: [
      'broken road', 'damaged road', 'রাস্তা ভাঙা', 'রাস্তায় গর্ত', 'রাস্তায় গর্ত',
      'সড়কে গর্ত', 'সড়কে গর্ত', 'পিচ উঠে', 'খানাখন্দ', 'road crack', 'sinkhole',
      'traffic light broken', 'traffic signal', 'road divider', 'speed breaker',
      'রাস্তা দেবে গেছে', 'রাস্তা চলাচলের অনুপযোগী', 'রাস্তার বেহাল দশা',
    ],
  },
]

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
      const isExcluded = item.excludeIfMatches.some((ex) => normalized.includes(ex.toLowerCase()))
      if (isExcluded) continue // Skip this category completely!
    }

    let score = 0
    const matchedPhrases = []
    const matchedEntities = []
    const matchedStates = []
    const matchedTriggers = []

    // 1. Decisive Multi-word Phrases (highest confidence: 20 points each)
    if (item.phrases) {
      for (const phrase of item.phrases) {
        if (normalized.includes(phrase.toLowerCase())) {
          score += 20
          matchedPhrases.push(phrase)
        }
      }
    }

    // 2. Physical Entities (6 points each)
    if (item.entities) {
      for (const entity of item.entities) {
        if (normalized.includes(entity.toLowerCase())) {
          score += 6
          matchedEntities.push(entity)
        }
      }
    }

    // 3. States / Actions (5 points each)
    if (item.states) {
      for (const state of item.states) {
        if (normalized.includes(state.toLowerCase())) {
          score += 5
          matchedStates.push(state)
        }
      }
    }

    // 4. Triggers / Hazard context (6 points each)
    if (item.triggers) {
      for (const trigger of item.triggers) {
        if (normalized.includes(trigger.toLowerCase())) {
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
