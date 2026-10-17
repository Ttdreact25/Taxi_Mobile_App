/**
 * Multi-Engine Location Search & Geocoding Service
 * Combines Backend Proxy, OpenStreetMap Photon, Nominatim, and Local Hubs
 * Guarantees 100% search uptime, instant results, and live reverse geocoding
 */
import * as Location from 'expo-location'
import { bookingsAPI, bookingAPI } from '../api/api'

// Major Tamil Nadu & South India Cities and Hubs for instant offline/zero-latency search
// Major Tamil Nadu & South India Cities and Hubs for instant offline/zero-latency search
export const TAMIL_NADU_HUBS = [
  // Major Chennai Hubs & Localities
  { name: 'Vadapalani Murugan Temple', address: 'Andavar Koil St, Vadapalani, Chennai, Tamil Nadu', lat: 13.0526, lng: 80.2120, tag: 'Temple / Spiritual 🛕' },
  { name: 'Vadapalani Metro Station', address: 'Jawaharlal Nehru Rd, Vadapalani, Chennai, Tamil Nadu', lat: 13.0509, lng: 80.2120, tag: 'Metro Station 🚇' },
  { name: 'Nexus Vijaya Mall (Forum Vadapalani)', address: 'Arcot Rd, Vadapalani, Chennai, Tamil Nadu', lat: 13.0502, lng: 80.2112, tag: 'Shopping Mall 🛍️' },
  { name: 'SIMS Hospital Vadapalani', address: 'Jawaharlal Nehru Rd, Vadapalani, Chennai, Tamil Nadu', lat: 13.0532, lng: 80.2118, tag: 'Hospital 🏥' },
  { name: 'Chennai Central Railway Station (MAS)', address: 'Kannappar Thidal, Periyamet, Chennai, Tamil Nadu', lat: 13.0827, lng: 80.2707, tag: 'Railway Station 🚆' },
  { name: 'Chennai International Airport (MAA)', address: 'GST Road, Meenambakkam, Chennai, Tamil Nadu', lat: 12.9941, lng: 80.1709, tag: 'Airport ✈️' },
  { name: 'CMBT Bus Terminus Koyambedu', address: 'Jawaharlal Nehru Rd, Koyambedu, Chennai, Tamil Nadu', lat: 13.0692, lng: 80.2057, tag: 'Bus Stand 🚌' },
  { name: 'Koyambedu Metro Station', address: 'Jawaharlal Nehru Rd, Koyambedu, Chennai, Tamil Nadu', lat: 13.0732, lng: 80.1945, tag: 'Metro Station 🚇' },
  { name: 'Kilambakkam Bus Terminus (KCBT)', address: 'GST Road, Kilambakkam, Vandalur, Chennai, Tamil Nadu', lat: 12.8682, lng: 80.0772, tag: 'Bus Stand 🚌' },
  { name: 'Tambaram Railway Station', address: 'GST Road, East Tambaram, Chennai, Tamil Nadu', lat: 12.9249, lng: 80.1197, tag: 'Railway Station 🚆' },
  { name: 'Tambaram Sanatorium', address: 'GST Road, Tambaram Sanatorium, Chennai, Tamil Nadu', lat: 12.9372, lng: 80.1285, tag: 'Railway Station 🚆' },
  { name: 'Egmore Railway Station (MS)', address: 'Gandhi Irwin Rd, Egmore, Chennai, Tamil Nadu', lat: 13.0784, lng: 80.2612, tag: 'Railway Station 🚆' },
  { name: 'T. Nagar (Ranganathan Street)', address: 'T. Nagar, Chennai, Tamil Nadu', lat: 13.0418, lng: 80.2341, tag: 'Shopping / Commercial 🛍️' },
  { name: 'Pondy Bazaar (T. Nagar)', address: 'Sir Thyagaraya Rd, T. Nagar, Chennai, Tamil Nadu', lat: 13.0408, lng: 80.2377, tag: 'Shopping / Commercial 🛍️' },
  { name: 'Panagal Park T. Nagar', address: 'Prakasam Rd, T. Nagar, Chennai, Tamil Nadu', lat: 13.0435, lng: 80.2325, tag: 'Landmark 📍' },
  { name: 'Marina Beach', address: 'Kamarajar Salai, Triplicane, Chennai, Tamil Nadu', lat: 13.0500, lng: 80.2824, tag: 'Landmark 📍' },
  { name: 'Besant Nagar (Edward Elliot Beach)', address: 'Besant Nagar, Chennai, Tamil Nadu', lat: 12.9997, lng: 80.2682, tag: 'Landmark 📍' },
  { name: 'Phoenix Marketcity Mall Velachery', address: 'Velachery Rd, Indira Gandhi Nagar, Velachery, Chennai, Tamil Nadu', lat: 12.9918, lng: 80.2170, tag: 'Shopping Mall 🛍️' },
  { name: 'Velachery MRTS Railway Station', address: 'Velachery MRTS, Chennai, Tamil Nadu', lat: 12.9676, lng: 80.2195, tag: 'Railway Station 🚆' },
  { name: 'Express Avenue Mall Royapettah', address: 'Club House Rd, Royapettah, Chennai, Tamil Nadu', lat: 13.0587, lng: 80.2642, tag: 'Shopping Mall 🛍️' },
  { name: 'VR Chennai Mall Anna Nagar', address: 'Jawaharlal Nehru Rd, Anna Nagar West, Chennai, Tamil Nadu', lat: 13.0850, lng: 80.1982, tag: 'Shopping Mall 🛍️' },
  { name: 'Anna Nagar Tower Park', address: 'Anna Nagar, Chennai, Tamil Nadu', lat: 13.0865, lng: 80.2142, tag: 'Landmark 📍' },
  { name: 'Anna Nagar Roundtana', address: '2nd Avenue, Anna Nagar, Chennai, Tamil Nadu', lat: 13.0848, lng: 80.2185, tag: 'Landmark 📍' },
  { name: 'Guindy Railway Station & Metro', address: 'GST Road, Guindy, Chennai, Tamil Nadu', lat: 13.0084, lng: 80.2128, tag: 'Metro Station 🚇' },
  { name: 'Kathipara Junction (Alandur)', address: 'GST Rd / Inner Ring Rd, Guindy, Chennai, Tamil Nadu', lat: 13.0072, lng: 80.2036, tag: 'Landmark 📍' },
  { name: 'Olympia Tech Park Guindy', address: 'SIDCO Industrial Estate, Guindy, Chennai, Tamil Nadu', lat: 13.0118, lng: 80.2052, tag: 'IT Park / Tech Hub 🏢' },
  { name: 'TIDEL Park (OMR)', address: 'Rajiv Gandhi Salai, Taramani, Chennai, Tamil Nadu', lat: 12.9892, lng: 80.2489, tag: 'IT Park / Tech Hub 🏢' },
  { name: 'Sholinganallur Junction (OMR)', address: 'OMR - Medavakkam Link Rd, Sholinganallur, Chennai, Tamil Nadu', lat: 12.9010, lng: 80.2279, tag: 'IT Park / Tech Hub 🏢' },
  { name: 'SIPCOT IT Park Siruseri', address: 'OMR, Siruseri, Chennai, Tamil Nadu', lat: 12.8258, lng: 80.2185, tag: 'IT Park / Tech Hub 🏢' },
  { name: 'DLF Cybercity Porur', address: 'Mount Poonamallee Rd, Manapakkam, Porur, Chennai, Tamil Nadu', lat: 13.0232, lng: 80.1654, tag: 'IT Park / Tech Hub 🏢' },
  { name: 'Porur Junction (Mount Poonamallee Rd)', address: 'Porur, Chennai, Tamil Nadu', lat: 13.0382, lng: 80.1565, tag: 'Landmark 📍' },
  { name: 'Sri Ramachandra Hospital Porur', address: 'Mount Poonamallee Rd, Porur, Chennai, Tamil Nadu', lat: 13.0360, lng: 80.1448, tag: 'Hospital 🏥' },
  { name: 'IIT Madras Adyar', address: 'Sardar Patel Rd, Guindy, Chennai, Tamil Nadu', lat: 12.9915, lng: 80.2337, tag: 'College / University 🎓' },
  { name: 'Adyar Signal (L.B. Road)', address: 'Lattice Bridge Rd, Adyar, Chennai, Tamil Nadu', lat: 13.0064, lng: 80.2575, tag: 'Landmark 📍' },
  { name: 'Apollo Main Hospital Greams Road', address: 'Greams Lane, Thousand Lights, Chennai, Tamil Nadu', lat: 13.0583, lng: 80.2505, tag: 'Hospital 🏥' },
  { name: 'MIOT International Hospital', address: 'Mount Poonamallee Rd, Manapakkam, Chennai, Tamil Nadu', lat: 13.0194, lng: 80.1772, tag: 'Hospital 🏥' },
  { name: 'Kapaleeshwarar Temple Mylapore', address: 'Vadakku Mada Veedi, Mylapore, Chennai, Tamil Nadu', lat: 13.0335, lng: 80.2694, tag: 'Temple / Spiritual 🛕' },
  { name: 'Mylapore Luz Corner', address: 'Royapettah High Rd, Mylapore, Chennai, Tamil Nadu', lat: 13.0375, lng: 80.2635, tag: 'Landmark 📍' },
  { name: 'Ashok Pillar (Ashok Nagar)', address: '1st Ave, Ashok Nagar, Chennai, Tamil Nadu', lat: 13.0354, lng: 80.2115, tag: 'Landmark 📍' },
  { name: 'K.K. Nagar Bus Terminus', address: 'Munusamy Salai, K.K. Nagar, Chennai, Tamil Nadu', lat: 13.0368, lng: 80.1985, tag: 'Bus Stand 🚌' },
  { name: 'Saidapet Metro & Court', address: 'Anna Salai, Saidapet, Chennai, Tamil Nadu', lat: 13.0235, lng: 80.2225, tag: 'Metro Station 🚇' },
  { name: 'Chromepet Railway Station & MIT', address: 'GST Road, Chromepet, Chennai, Tamil Nadu', lat: 12.9517, lng: 80.1412, tag: 'Railway Station 🚆' },
  { name: 'Pallavaram Railway Station', address: 'GST Road, Pallavaram, Chennai, Tamil Nadu', lat: 12.9678, lng: 80.1492, tag: 'Railway Station 🚆' },
  { name: 'Medavakkam Koot Road', address: 'Velachery Main Rd, Medavakkam, Chennai, Tamil Nadu', lat: 12.9185, lng: 80.1925, tag: 'Landmark 📍' },
  { name: 'Perambur Railway Station', address: 'Perambur High Rd, Chennai, Tamil Nadu', lat: 13.1090, lng: 80.2435, tag: 'Railway Station 🚆' },
  { name: 'Ambattur Industrial Estate (OT)', address: 'MTH Road, Ambattur, Chennai, Tamil Nadu', lat: 13.1143, lng: 80.1548, tag: 'Company / Office 🏢' },
  { name: 'Avadi Bus Terminus & Station', address: 'Avadi, Chennai, Tamil Nadu', lat: 13.1185, lng: 80.1015, tag: 'Bus Stand 🚌' },
  { name: 'Poonamallee Bus Terminus', address: 'Trunk Rd, Poonamallee, Chennai, Tamil Nadu', lat: 13.0485, lng: 80.0925, tag: 'Bus Stand 🚌' },
  { name: 'Thiruvanmiyur RTO & Beach', address: 'East Coast Rd, Thiruvanmiyur, Chennai, Tamil Nadu', lat: 12.9830, lng: 80.2595, tag: 'Landmark 📍' },
  { name: 'Mahabalipuram (Shore Temple)', address: 'Mahabalipuram, Chengalpattu, Tamil Nadu', lat: 12.6169, lng: 80.1994, tag: 'Landmark 📍' },

  // Major Tamil Nadu Cities & Districts
  { name: 'Madurai City', address: 'Madurai, Tamil Nadu, India', lat: 9.9252, lng: 78.1198, tag: 'City 🏙️' },
  { name: 'Madurai Meenakshi Amman Temple', address: 'Madurai Main, Madurai, Tamil Nadu', lat: 9.9195, lng: 78.1193, tag: 'Temple / Spiritual 🛕' },
  { name: 'Madurai Junction Railway Station', address: 'Railway Colony, Madurai, Tamil Nadu', lat: 9.9168, lng: 78.1118, tag: 'Railway Station 🚆' },
  { name: 'Madurai Airport (IXM)', address: 'Airport Road, Madurai, Tamil Nadu', lat: 9.8345, lng: 78.0934, tag: 'Airport ✈️' },
  { name: 'Mattuthavani Integrated Bus Terminus', address: 'Mattuthavani, Madurai, Tamil Nadu', lat: 9.9452, lng: 78.1568, tag: 'Bus Stand 🚌' },
  { name: 'Coimbatore City', address: 'Coimbatore, Tamil Nadu, India', lat: 11.0168, lng: 76.9558, tag: 'City 🏙️' },
  { name: 'Gandhipuram Bus Stand', address: 'Gandhipuram, Coimbatore, Tamil Nadu', lat: 11.0183, lng: 76.9654, tag: 'Bus Stand 🚌' },
  { name: 'Coimbatore Junction (CBE)', address: 'Gopalapuram, Coimbatore, Tamil Nadu', lat: 10.9979, lng: 76.9667, tag: 'Railway Station 🚆' },
  { name: 'Coimbatore International Airport (CJB)', address: 'Civil Aerodrome Post, Peelamedu, Coimbatore, Tamil Nadu', lat: 11.0300, lng: 77.0434, tag: 'Airport ✈️' },
  { name: 'Salem City', address: 'Salem, Tamil Nadu, India', lat: 11.6643, lng: 78.1460, tag: 'City 🏙️' },
  { name: 'Salem New Bus Stand', address: 'Meyyanur, Salem, Tamil Nadu', lat: 11.6685, lng: 78.1362, tag: 'Bus Stand 🚌' },
  { name: 'Salem Junction (SA)', address: 'Suramangalam, Salem, Tamil Nadu', lat: 11.6742, lng: 78.1147, tag: 'Railway Station 🚆' },
  { name: 'Tiruchirappalli (Trichy) City', address: 'Tiruchirappalli, Tamil Nadu, India', lat: 10.7905, lng: 78.7047, tag: 'City 🏙️' },
  { name: 'Trichy Central Bus Stand', address: 'Cantonment, Tiruchirappalli, Tamil Nadu', lat: 10.8038, lng: 78.6874, tag: 'Bus Stand 🚌' },
  { name: 'Trichy International Airport (TRZ)', address: 'Old Terminal Building, Tiruchirappalli, Tamil Nadu', lat: 10.7654, lng: 78.7126, tag: 'Airport ✈️' },
  { name: 'Srirangam Ranganathaswamy Temple', address: 'Srirangam, Tiruchirappalli, Tamil Nadu', lat: 10.8623, lng: 78.6903, tag: 'Temple / Spiritual 🛕' },
  { name: 'Tirunelveli City', address: 'Tirunelveli, Tamil Nadu, India', lat: 8.7139, lng: 77.7567, tag: 'City 🏙️' },
  { name: 'Tirunelveli Junction', address: 'Tirunelveli, Tamil Nadu', lat: 8.7297, lng: 77.7128, tag: 'Railway Station 🚆' },
  { name: 'Erode City', address: 'Erode, Tamil Nadu, India', lat: 11.3410, lng: 77.7172, tag: 'City 🏙️' },
  { name: 'Tiruppur City', address: 'Tiruppur, Tamil Nadu, India', lat: 11.1085, lng: 77.3411, tag: 'City 🏙️' },
  { name: 'Vellore City', address: 'Vellore, Tamil Nadu, India', lat: 12.9165, lng: 79.1325, tag: 'City 🏙️' },
  { name: 'Katpadi Junction Railway Station', address: 'Katpadi, Vellore, Tamil Nadu', lat: 12.9698, lng: 79.1390, tag: 'Railway Station 🚆' },
  { name: 'CMC Hospital Vellore', address: 'Ida Scudder Rd, Vellore, Tamil Nadu', lat: 12.9248, lng: 79.1352, tag: 'Hospital 🏥' },
  { name: 'Thanjavur (Brihadisvara Temple)', address: 'Thanjavur, Tamil Nadu, India', lat: 10.7870, lng: 79.1378, tag: 'Temple / Spiritual 🛕' },
  { name: 'Dindigul City', address: 'Dindigul, Tamil Nadu, India', lat: 10.3673, lng: 77.9803, tag: 'City 🏙️' },
  { name: 'Kanyakumari (Cape Comorin)', address: 'Kanyakumari, Tamil Nadu, India', lat: 8.0883, lng: 77.5385, tag: 'Landmark 📍' },
  { name: 'Nagercoil City', address: 'Nagercoil, Kanyakumari, Tamil Nadu, India', lat: 8.1833, lng: 77.4119, tag: 'City 🏙️' },
  { name: 'Hosur City', address: 'Hosur, Krishnagiri, Tamil Nadu, India', lat: 12.7409, lng: 77.8253, tag: 'City 🏙️' },
  { name: 'Kanchipuram Temple City', address: 'Kanchipuram, Tamil Nadu, India', lat: 12.8342, lng: 79.7036, tag: 'City 🏙️' },
  { name: 'Tiruvannamalai (Arunachaleswarar Temple)', address: 'Tiruvannamalai, Tamil Nadu, India', lat: 12.2253, lng: 79.0747, tag: 'Temple / Spiritual 🛕' },
  { name: 'Kumbakonam City', address: 'Kumbakonam, Thanjavur, Tamil Nadu, India', lat: 10.9602, lng: 79.3845, tag: 'City 🏙️' },
  { name: 'Cuddalore City', address: 'Cuddalore, Tamil Nadu, India', lat: 11.7480, lng: 79.7714, tag: 'City 🏙️' },
  { name: 'Chidambaram Natarajar Temple', address: 'Chidambaram, Cuddalore, Tamil Nadu, India', lat: 11.3992, lng: 79.6936, tag: 'Temple / Spiritual 🛕' },
  { name: 'Karur City', address: 'Karur, Tamil Nadu, India', lat: 10.9601, lng: 78.0766, tag: 'City 🏙️' },
  { name: 'Theni City', address: 'Theni, Tamil Nadu, India', lat: 10.0104, lng: 77.4768, tag: 'City 🏙️' },
  { name: 'Ooty (Udhagamandalam Hill Station)', address: 'Nilgiris, Tamil Nadu, India', lat: 11.4102, lng: 76.6950, tag: 'Hill Station 🌲' },
  { name: 'Kodaikanal Hill Station', address: 'Dindigul, Tamil Nadu, India', lat: 10.2381, lng: 77.4892, tag: 'Hill Station 🌲' },
  { name: 'Yercaud Hill Station', address: 'Shevaroys, Salem, Tamil Nadu, India', lat: 11.7753, lng: 78.2093, tag: 'Hill Station 🌲' },
  { name: 'Rameswaram (Ramanathaswamy Temple)', address: 'Ramanathapuram, Tamil Nadu, India', lat: 9.2876, lng: 79.3129, tag: 'Temple / Spiritual 🛕' },
  { name: 'Karaikudi (Chettinad)', address: 'Sivaganga, Tamil Nadu, India', lat: 10.0735, lng: 78.7732, tag: 'City 🏙️' },
  { name: 'Pollachi Town', address: 'Coimbatore, Tamil Nadu, India', lat: 10.6609, lng: 77.0048, tag: 'City 🏙️' },
  { name: 'Rajapalayam', address: 'Virudhunagar, Tamil Nadu, India', lat: 9.4533, lng: 77.5552, tag: 'City 🏙️' },
  { name: 'Sivakasi Town', address: 'Virudhunagar, Tamil Nadu, India', lat: 9.4532, lng: 77.7946, tag: 'City 🏙️' },
  { name: 'Namakkal City', address: 'Namakkal, Tamil Nadu, India', lat: 11.2189, lng: 78.1674, tag: 'City 🏙️' },
  { name: 'Dharmapuri Town', address: 'Dharmapuri, Tamil Nadu, India', lat: 12.1211, lng: 78.1582, tag: 'City 🏙️' },
  { name: 'Krishnagiri Town', address: 'Krishnagiri, Tamil Nadu, India', lat: 12.5266, lng: 78.2146, tag: 'City 🏙️' },
  { name: 'Villupuram Junction', address: 'Villupuram, Tamil Nadu, India', lat: 11.9401, lng: 79.4861, tag: 'City 🏙️' },
  { name: 'Chengalpattu Junction', address: 'Chengalpattu, Tamil Nadu, India', lat: 12.6841, lng: 79.9836, tag: 'City 🏙️' },
  { name: 'Pondicherry (Puducherry)', address: 'Puducherry, India', lat: 11.9416, lng: 79.8083, tag: 'City 🏙️' },
  { name: 'Bengaluru (Bangalore)', address: 'Bengaluru, Karnataka, India', lat: 12.9716, lng: 77.5946, tag: 'City 🏙️' },
  { name: 'Tirupati (Sri Venkateswara Swamy Temple)', address: 'Tirupati, Andhra Pradesh, India', lat: 13.6288, lng: 79.4192, tag: 'Temple / Spiritual 🛕' },
]

// In-Memory Search Query Cache for Instant Zero-Latency Typing
const _searchMemoryCache = new Map()

/**
 * Get popular destinations sorted by distance from current location
 * Used to immediately show suggestions when destination input is clicked/focused
 */
export const getPopularDestinations = (userLat = null, userLng = null) => {
  const uLat = userLat || 13.0827
  const uLng = userLng || 80.2707
  return TAMIL_NADU_HUBS.map(hub => {
    const dist = calculateDistanceKm(uLat, uLng, hub.lat, hub.lng)
    return {
      place_id: `popular_${hub.lat}_${hub.lng}_${encodeURIComponent(hub.name)}`,
      description: `${hub.name}, ${hub.address}`,
      structured_formatting: {
        main_text: hub.name,
        secondary_text: hub.address,
      },
      geometry: { location: { lat: hub.lat, lng: hub.lng } },
      latitude: hub.lat,
      longitude: hub.lng,
      distance_km: dist,
      category_tag: hub.tag,
      is_popular: true,
    }
  }).sort((a, b) => a.distance_km - b.distance_km)
}

// Haversine distance in KM
export const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return parseFloat((R * c).toFixed(1))
}

// Auto detect category icon tag
const detectCategoryTag = (name = '', address = '', types = []) => {
  const text = `${name} ${address} ${types.join(' ')}`.toLowerCase()
  if (text.includes('airport') || text.includes('aerodrome') || text.includes('terminal')) return 'Airport ✈️'
  if (text.includes('railway') || text.includes('train station') || text.includes('junction') || text.includes('central')) return 'Railway Station 🚆'
  if (text.includes('bus stand') || text.includes('bus stop') || text.includes('bus terminus') || text.includes('depot')) return 'Bus Stand 🚌'
  if (text.includes('metro') || text.includes('subway')) return 'Metro Station 🚇'
  if (text.includes('hospital') || text.includes('clinic') || text.includes('medical') || text.includes('healthcare')) return 'Hospital 🏥'
  if (text.includes('mall') || text.includes('shopping') || text.includes('bazaar') || text.includes('market')) return 'Shopping Mall 🛍️'
  if (text.includes('temple') || text.includes('church') || text.includes('mosque') || text.includes('shrine') || text.includes('kovil')) return 'Temple / Spiritual 🛕'
  if (text.includes('college') || text.includes('university') || text.includes('school') || text.includes('campus')) return 'College / School 🎓'
  if (text.includes('hotel') || text.includes('resort') || text.includes('lodge') || text.includes('inn')) return 'Hotel 🏨'
  if (text.includes('restaurant') || text.includes('cafe') || text.includes('food') || text.includes('mess') || text.includes('bistro')) return 'Restaurant / Food 🍽️'
  if (text.includes('tech park') || text.includes('it park') || text.includes('software') || text.includes('office') || text.includes('sidco')) return 'Company / Office 🏢'
  return 'Location 📍'
}

/**
 * Universal Multi-Engine Search Places Autocomplete
 * Runs Photon Komoot and Backend in parallel for instant (<200ms) smooth response
 */
export const searchPlacesService = async (query, userLat = null, userLng = null, sessionToken = null) => {
  const cleanQ = (query || '').trim()
  if (cleanQ.length < 2) return []

  const uLat = userLat || 13.0382
  const uLng = userLng || 80.2315
  const cacheKey = `${cleanQ.toLowerCase()}_${uLat.toFixed(2)}_${uLng.toFixed(2)}`

  if (_searchMemoryCache.has(cacheKey)) {
    return _searchMemoryCache.get(cacheKey)
  }

  const results = []
  const seenKeys = new Set()

  const addPrediction = (item) => {
    const key = (item.structured_formatting?.main_text || item.description || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    if (!key || seenKeys.has(key)) return
    seenKeys.add(key)
    results.push(item)
  }

  // 1. First Tier: Local Hubs & Offline Cities instant match (0ms latency)
  const qLower = cleanQ.toLowerCase()
  for (const hub of TAMIL_NADU_HUBS) {
    if (
      hub.name.toLowerCase().includes(qLower) ||
      hub.address.toLowerCase().includes(qLower) ||
      qLower.includes(hub.name.toLowerCase().split(' ')[0])
    ) {
      const dist = calculateDistanceKm(uLat, uLng, hub.lat, hub.lng)
      addPrediction({
        place_id: `hub_${hub.lat}_${hub.lng}_${encodeURIComponent(hub.name)}`,
        description: `${hub.name}, ${hub.address}`,
        structured_formatting: {
          main_text: hub.name,
          secondary_text: hub.address,
        },
        geometry: { location: { lat: hub.lat, lng: hub.lng } },
        latitude: hub.lat,
        longitude: hub.lng,
        distance_km: dist,
        category_tag: hub.tag,
      })
    }
  }

  // 2. Parallel Engines: Photon Komoot API (<150ms) + Backend Proxy in Parallel
  const photonPromise = (async () => {
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQ)}&lat=${uLat}&lon=${uLng}&limit=12`
      const pController = new AbortController()
      const pTimeout = setTimeout(() => pController.abort(), 2000)
      const pRes = await fetch(photonUrl, { signal: pController.signal })
      clearTimeout(pTimeout)
      if (pRes.ok) {
        const pData = await pRes.json()
        return pData.features || []
      }
    } catch {}
    return []
  })()

  const backendPromise = (async () => {
    try {
      const backendRes = await Promise.race([
        bookingsAPI.placesAutocomplete(cleanQ, uLat, uLng, sessionToken),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ])
      return backendRes.data?.predictions || []
    } catch {}
    return []
  })()

  const [photonOutcome, backendOutcome] = await Promise.allSettled([photonPromise, backendPromise])

  // Process Photon predictions
  if (photonOutcome.status === 'fulfilled' && Array.isArray(photonOutcome.value)) {
    for (const f of photonOutcome.value) {
      const props = f.properties || {}
      const coords = f.geometry?.coordinates || []
      const lon = parseFloat(coords[0])
      const lat = parseFloat(coords[1])
      if (!lat || !lon) continue

      const name = props.name || props.street || cleanQ
      const parts = [
        props.street,
        props.district || props.suburb || props.locality,
        props.city,
        props.state,
      ].filter(Boolean)
      const secondary = parts.filter(p => p !== name).join(', ')
      const fullDesc = secondary ? `${name}, ${secondary}` : name
      const dist = calculateDistanceKm(uLat, uLng, lat, lon)
      const tag = detectCategoryTag(name, fullDesc, [props.osm_value || props.type || ''])

      addPrediction({
        place_id: `photon_${lat}_${lon}_${encodeURIComponent(name)}`,
        description: fullDesc,
        structured_formatting: {
          main_text: name,
          secondary_text: secondary || 'Tamil Nadu, India',
        },
        geometry: { location: { lat, lng: lon } },
        latitude: lat,
        longitude: lon,
        distance_km: dist,
        category_tag: tag,
      })
    }
  }

  // Process Backend predictions
  if (backendOutcome.status === 'fulfilled' && Array.isArray(backendOutcome.value)) {
    for (const p of backendOutcome.value) {
      const pLat = parseFloat(p.latitude || p.geometry?.location?.lat || 0)
      const pLng = parseFloat(p.longitude || p.geometry?.location?.lng || 0)
      const dist = p.distance_km ?? (pLat && pLng ? calculateDistanceKm(uLat, uLng, pLat, pLng) : 3.5)
      addPrediction({
        place_id: p.place_id || `b_${Math.random()}`,
        description: p.description,
        structured_formatting: {
          main_text: p.structured_formatting?.main_text || p.description,
          secondary_text: p.structured_formatting?.secondary_text || '',
        },
        geometry: p.geometry || (pLat && pLng ? { location: { lat: pLat, lng: pLng } } : null),
        latitude: pLat || null,
        longitude: pLng || null,
        distance_km: dist,
        category_tag: p.category_tag || detectCategoryTag(p.description),
      })
    }
  }

  // 3. Fallback: OpenStreetMap Nominatim if results are still sparse
  if (results.length < 3) {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQ)}&countrycodes=in&limit=6`
      const nController = new AbortController()
      const nTimeout = setTimeout(() => nController.abort(), 2000)
      const nRes = await fetch(nomUrl, {
        signal: nController.signal,
        headers: { 'User-Agent': 'CityOneTaxiApp/1.0 (contact@toptechsoftwaresolutions.in)' }
      })
      clearTimeout(nTimeout)

      if (nRes.ok) {
        const nData = await nRes.json()
        if (Array.isArray(nData)) {
          for (const item of nData) {
            const lat = parseFloat(item.lat)
            const lon = parseFloat(item.lon)
            if (!lat || !lon) continue

            const dispName = item.display_name || cleanQ
            const parts = dispName.split(',').map(s => s.trim())
            const mainText = parts[0] || cleanQ
            const secText = parts.slice(1).join(', ')
            const dist = calculateDistanceKm(uLat, uLng, lat, lon)
            const tag = detectCategoryTag(mainText, dispName, [item.type || '', item.class || ''])

            addPrediction({
              place_id: `osm_${lat}_${lon}_${encodeURIComponent(mainText)}`,
              description: dispName,
              structured_formatting: {
                main_text: mainText,
                secondary_text: secText,
              },
              geometry: { location: { lat, lng: lon } },
              latitude: lat,
              longitude: lon,
              distance_km: dist,
              category_tag: tag,
            })
          }
        }
      }
    } catch {}
  }

  // 5. Fifth Tier: Device Native Geocoding
  if (results.length === 0) {
    try {
      const geoResults = await Location.geocodeAsync(cleanQ)
      if (Array.isArray(geoResults) && geoResults.length > 0) {
        geoResults.slice(0, 4).forEach((g, idx) => {
          const dist = calculateDistanceKm(uLat, uLng, g.latitude, g.longitude)
          addPrediction({
            place_id: `device_geo_${idx}_${g.latitude}_${g.longitude}`,
            description: `${cleanQ} (${g.latitude.toFixed(4)}, ${g.longitude.toFixed(4)})`,
            structured_formatting: {
              main_text: cleanQ,
              secondary_text: `Coordinates: ${g.latitude.toFixed(4)}, ${g.longitude.toFixed(4)}`,
            },
            geometry: { location: { lat: g.latitude, lng: g.longitude } },
            latitude: g.latitude,
            longitude: g.longitude,
            distance_km: dist,
            category_tag: 'Location 📍',
          })
        })
      }
    } catch (err) {}
  }

  // Sort: Relevance to typed query FIRST (accurate results at top), then distance as tie-breaker!
  const qL = cleanQ.toLowerCase()
  const sorted = results.sort((a, b) => {
    const aMain = (a.structured_formatting?.main_text || a.description || '').toLowerCase()
    const bMain = (b.structured_formatting?.main_text || b.description || '').toLowerCase()
    const aDesc = (a.description || '').toLowerCase()
    const bDesc = (b.description || '').toLowerCase()

    // 1. Exact match
    const aExact = (aMain === qL) ? 100 : 0
    const bExact = (bMain === qL) ? 100 : 0
    if (aExact !== bExact) return bExact - aExact

    // 2. Starts with query (prefix match)
    const aStarts = aMain.startsWith(qL) ? 50 : (aDesc.startsWith(qL) ? 40 : 0)
    const bStarts = bMain.startsWith(qL) ? 50 : (bDesc.startsWith(qL) ? 40 : 0)
    if (aStarts !== bStarts) return bStarts - aStarts

    // 3. Word boundary match
    const aWord = (aMain.includes(` ${qL}`) || aDesc.includes(` ${qL}`)) ? 30 : 0
    const bWord = (bMain.includes(` ${qL}`) || bDesc.includes(` ${qL}`)) ? 30 : 0
    if (aWord !== bWord) return bWord - aWord

    // 4. Substring match
    const aInc = aMain.includes(qL) ? 20 : (aDesc.includes(qL) ? 10 : 0)
    const bInc = bMain.includes(qL) ? 20 : (bDesc.includes(qL) ? 10 : 0)
    if (aInc !== bInc) return bInc - aInc

    // 5. Tie breaker: Distance to user
    return (a.distance_km || 999) - (b.distance_km || 999)
  })

  const finalResults = sorted.slice(0, 15)
  _searchMemoryCache.set(cacheKey, finalResults)
  return finalResults
}

const _reverseCache = new Map()

/**
 * Universal Reverse Geocode Coordinates to Human-Readable Address
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<string>} Human readable street/area address
 */
export const reverseGeocodeService = async (latitude, longitude) => {
  const lat = parseFloat(latitude)
  const lng = parseFloat(longitude)
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return 'Select Location'

  const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`
  if (_reverseCache.has(cacheKey)) {
    return _reverseCache.get(cacheKey)
  }

  // 1. Try Expo Native Location Reverse Geocoding with strict 1.5s race timeout
  try {
    const results = await Promise.race([
      Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }),
      new Promise((_, r) => setTimeout(() => r(null), 1500))
    ])
    if (results && results.length > 0) {
      const r = results[0]
      const parts = [
        r.name || r.streetNumber,
        r.street,
        r.subregion || r.district,
        r.city,
      ].filter(Boolean)
      const addr = parts.join(', ')
      if (addr && addr.length > 3) {
        _reverseCache.set(cacheKey, addr)
        return addr
      }
    }
  } catch (e) {}

  // 2. Try BigDataCloud Reverse Geocoding (Ultra fast ~150ms HTTP CDN response)
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    const bdcRes = await Promise.race([
      fetch(bdcUrl),
      new Promise((_, r) => setTimeout(() => r(null), 1800))
    ])
    if (bdcRes && bdcRes.ok) {
      const bdcData = await bdcRes.json()
      const locality = bdcData.locality || bdcData.city || bdcData.principalSubdivision
      const admin = bdcData.localityInfo?.administrative || []
      const neighborhood = admin.find(a => a.order >= 10)?.name
      const city = bdcData.city || admin.find(a => a.adminLevel === 5)?.name
      const state = bdcData.principalSubdivision

      const parts = [neighborhood, locality, city, state].filter((val, idx, arr) => val && arr.indexOf(val) === idx)
      if (parts.length > 0) {
        const addr = parts.join(', ')
        _reverseCache.set(cacheKey, addr)
        return addr
      }
    }
  } catch (e) {}

  // 3. Try Backend Reverse Geocode API
  try {
    const backendRes = await bookingAPI.reverseGeocode(lat, lng)
    const bAddr = backendRes.data?.formatted_address || backendRes.data?.address
    if (bAddr && !bAddr.includes('Location near')) {
      _reverseCache.set(cacheKey, bAddr)
      return bAddr
    }
  } catch (e) {}

  // 4. Try OpenStreetMap Nominatim Reverse
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    const nomRes = await fetch(nomUrl, {
      headers: { 'User-Agent': 'CityOneTaxiApp/1.0 (contact@toptechsoftwaresolutions.in)' }
    })
    if (nomRes.ok) {
      const nomData = await nomRes.json()
      const addrObj = nomData.address || {}
      const street = addrObj.road || addrObj.neighbourhood || addrObj.suburb
      const city = addrObj.city || addrObj.town || addrObj.county || addrObj.state_district
      if (street || city) {
        return [street, city].filter(Boolean).join(', ')
      }
      if (nomData.display_name) {
        const parts = nomData.display_name.split(',').map(s => s.trim())
        return parts.slice(0, 3).join(', ')
      }
    }
  } catch (e) {}

  // 5. Fallback Coordinates
  return `GPS Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`
}
