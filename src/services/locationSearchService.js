/**
 * Multi-Engine Location Search & Geocoding Service
 * Combines Backend Proxy, OpenStreetMap Photon, Nominatim, and Local Hubs
 * Guarantees 100% search uptime, instant results, and live reverse geocoding
 */
import * as Location from 'expo-location'
import { bookingsAPI, bookingAPI } from '../api/api'

// Major Tamil Nadu & South India Cities and Hubs for instant offline/zero-latency search
const TAMIL_NADU_HUBS = [
  { name: 'Chennai Central Railway Station (MAS)', address: 'Kannappar Thidal, Periyamet, Chennai, Tamil Nadu', lat: 13.0827, lng: 80.2707, tag: 'Railway Station 🚆' },
  { name: 'Chennai International Airport (MAA)', address: 'GST Road, Meenambakkam, Chennai, Tamil Nadu', lat: 12.9941, lng: 80.1709, tag: 'Airport ✈️' },
  { name: 'CMBT Bus Terminus Koyambedu', address: 'Jawaharlal Nehru Rd, Koyambedu, Chennai, Tamil Nadu', lat: 13.0692, lng: 80.2057, tag: 'Bus Stand 🚌' },
  { name: 'Kilambakkam Bus Terminus (KCBT)', address: 'GST Road, Kilambakkam, Vandalur, Chennai, Tamil Nadu', lat: 12.8682, lng: 80.0772, tag: 'Bus Stand 🚌' },
  { name: 'T. Nagar (Thyagaraya Nagar)', address: 'T. Nagar, Chennai, Tamil Nadu', lat: 13.0418, lng: 80.2341, tag: 'Shopping / Commercial 🛍️' },
  { name: 'Marina Beach', address: 'Kamarajar Salai, Triplicane, Chennai, Tamil Nadu', lat: 13.0500, lng: 80.2824, tag: 'Landmark 📍' },
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
  { name: 'Tirunelveli City', address: 'Tirunelveli, Tamil Nadu, India', lat: 8.7139, lng: 77.7567, tag: 'City 🏙️' },
  { name: 'Tirunelveli Junction', address: 'Tirunelveli, Tamil Nadu', lat: 8.7297, lng: 77.7128, tag: 'Railway Station 🚆' },
  { name: 'Erode City', address: 'Erode, Tamil Nadu, India', lat: 11.3410, lng: 77.7172, tag: 'City 🏙️' },
  { name: 'Tiruppur City', address: 'Tiruppur, Tamil Nadu, India', lat: 11.1085, lng: 77.3411, tag: 'City 🏙️' },
  { name: 'Vellore City', address: 'Vellore, Tamil Nadu, India', lat: 12.9165, lng: 79.1325, tag: 'City 🏙️' },
  { name: 'Thanjavur City', address: 'Thanjavur, Tamil Nadu, India', lat: 10.7870, lng: 79.1378, tag: 'City 🏙️' },
  { name: 'Dindigul City', address: 'Dindigul, Tamil Nadu, India', lat: 10.3673, lng: 77.9803, tag: 'City 🏙️' },
  { name: 'Kanyakumari', address: 'Kanyakumari, Tamil Nadu, India', lat: 8.0883, lng: 77.5385, tag: 'Landmark 📍' },
  { name: 'Pondicherry (Puducherry)', address: 'Puducherry, India', lat: 11.9416, lng: 79.8083, tag: 'City 🏙️' },
  { name: 'Bengaluru (Bangalore)', address: 'Bengaluru, Karnataka, India', lat: 12.9716, lng: 77.5946, tag: 'City 🏙️' },
]

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
 * @param {string} query - Location text query
 * @param {number|null} userLat - User current latitude for distance & bias
 * @param {number|null} userLng - User current longitude for distance & bias
 * @param {string|null} sessionToken - Optional session token for billing/proxy
 * @returns {Promise<Array>} Array of unified prediction objects
 */
export const searchPlacesService = async (query, userLat = null, userLng = null, sessionToken = null) => {
  const cleanQ = (query || '').trim()
  if (cleanQ.length < 2) return []

  const uLat = userLat || 13.0382
  const uLng = userLng || 80.2315
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

  // 1. First Tier: Local Hubs & Offline Cities instant match
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

  // 2. Second Tier: Backend Proxy Autocomplete
  try {
    const backendRes = await bookingsAPI.placesAutocomplete(cleanQ, uLat, uLng, sessionToken)
    const backendPredictions = backendRes.data?.predictions || []
    if (Array.isArray(backendPredictions) && backendPredictions.length > 0) {
      for (const p of backendPredictions) {
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
  } catch (err) {
    // Backend proxy failed or offline, fall through to direct engines
  }

  // If already found sufficient results, return early
  if (results.length >= 6) {
    return results.sort((a, b) => (a.distance_km || 999) - (b.distance_km || 999))
  }

  // 3. Third Tier: Komoot Photon API (Free, high-speed, comprehensive Indian coverage)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQ)}&lat=${uLat}&lon=${uLng}&limit=8`
    const pController = new AbortController()
    const pTimeout = setTimeout(() => pController.abort(), 3500)
    const pRes = await fetch(photonUrl, { signal: pController.signal })
    clearTimeout(pTimeout)

    if (pRes.ok) {
      const pData = await pRes.json()
      const features = pData.features || []
      for (const f of features) {
        const props = f.properties || {}
        const coords = f.geometry?.coordinates || []
        const lon = parseFloat(coords[0])
        const lat = parseFloat(coords[1])
        if (!lat || !lon) continue

        const name = props.name || props.street || cleanQ
        const parts = [
          props.street,
          props.district || props.suburb,
          props.city,
          props.state,
          props.country,
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
  } catch (err) {
    // Photon engine timeout or offline
  }

  // 4. Fourth Tier: OpenStreetMap Nominatim API (with country filter)
  if (results.length < 4) {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQ)}&countrycodes=in&limit=6`
      const nController = new AbortController()
      const nTimeout = setTimeout(() => nController.abort(), 3500)
      const nRes = await fetch(nomUrl, {
        signal: nController.signal,
        headers: { 'User-Agent': 'CityDropTaxiApp/1.0 (contact@toptechsoftwaresolutions.in)' }
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
    } catch (err) {
      // Nominatim failed
    }
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

  // Sort: Places closer to the user appear first!
  return results.sort((a, b) => (a.distance_km || 999) - (b.distance_km || 999))
}

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

  // 1. Try Expo Native Location Reverse Geocoding
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
    if (results && results.length > 0) {
      const r = results[0]
      const parts = [
        r.name || r.streetNumber,
        r.street,
        r.subregion || r.district,
        r.city,
      ].filter(Boolean)
      const addr = parts.join(', ')
      if (addr && addr.length > 3) return addr
    }
  } catch (e) {}

  // 2. Try Backend Reverse Geocode API
  try {
    const backendRes = await bookingAPI.reverseGeocode(lat, lng)
    const bAddr = backendRes.data?.formatted_address || backendRes.data?.address
    if (bAddr && !bAddr.includes('Location near')) {
      return bAddr
    }
  } catch (e) {}

  // 3. Try BigDataCloud Reverse Geocoding (Fast, Free, No API key)
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    const bdcRes = await fetch(bdcUrl)
    if (bdcRes.ok) {
      const bdcData = await bdcRes.json()
      const locality = bdcData.locality || bdcData.city || bdcData.principalSubdivision
      const admin = bdcData.localityInfo?.administrative || []
      const neighborhood = admin.find(a => a.order >= 10)?.name
      const city = bdcData.city || admin.find(a => a.adminLevel === 5)?.name
      const state = bdcData.principalSubdivision

      const parts = [neighborhood, locality, city, state].filter((val, idx, arr) => val && arr.indexOf(val) === idx)
      if (parts.length > 0) {
        return parts.join(', ')
      }
    }
  } catch (e) {}

  // 4. Try OpenStreetMap Nominatim Reverse
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    const nomRes = await fetch(nomUrl, {
      headers: { 'User-Agent': 'CityDropTaxiApp/1.0 (contact@toptechsoftwaresolutions.in)' }
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
