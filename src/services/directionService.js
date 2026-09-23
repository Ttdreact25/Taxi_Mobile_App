/**
 * Direction & Live Route Polyline Service
 * Computes road-following route waypoints, live distances, ETA, and vehicle bearings.
 * Uses Google Directions API with fallback to OSRM and interpolated geometry.
 */

// Helper to decode Google Polyline algorithm string into [{ latitude, longitude }, ...]
export const decodePolyline = (encoded) => {
  if (!encoded) return []
  const points = []
  let index = 0
  const len = encoded.length
  let lat = 0
  let lng = 0

  while (index < len) {
    let b
    let shift = 0
    let result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1))
    lat += dlat

    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1))
    lng += dlng

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    })
  }
  return points
}

// Haversine direct distance in KM
export const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0
  const R = 6371 // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Calculate compass bearing between two coordinates (0° to 360°)
export const calculateBearing = (startLat, startLng, destLat, destLng) => {
  if (!startLat || !startLng || !destLat || !destLng) return 0
  const startLatRad = (startLat * Math.PI) / 180
  const startLngRad = (startLng * Math.PI) / 180
  const destLatRad = (destLat * Math.PI) / 180
  const destLngRad = (destLng * Math.PI) / 180

  const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad)
  const x =
    Math.cos(startLatRad) * Math.sin(destLatRad) -
    Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad)

  let brng = (Math.atan2(y, x) * 180) / Math.PI
  return (brng + 360) % 360
}

// Generate smooth multi-point fallback route if external routing API is unavailable
export const generateFallbackRoute = (start, end, numPoints = 12) => {
  if (!start || !end) return []
  const coords = []
  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints
    // Add subtle curvature to simulate road routing
    const arc = Math.sin(fraction * Math.PI) * 0.0015
    coords.push({
      latitude: start.latitude + (end.latitude - start.latitude) * fraction + arc,
      longitude: start.longitude + (end.longitude - start.longitude) * fraction + arc * 0.5,
    })
  }
  return coords
}

/**
 * Fetch driving directions with road polyline, distance in km, and duration in mins
 * @param {Object} origin { latitude, longitude }
 * @param {Object} destination { latitude, longitude }
 * @param {Array} waypoints Optional intermediate [{ latitude, longitude }, ...]
 */
export const fetchRouteDirections = async (origin, destination, waypoints = []) => {
  if (!origin?.latitude || !origin?.longitude || !destination?.latitude || !destination?.longitude) {
    return {
      coordinates: [],
      distanceKm: 0,
      durationMins: 0,
      summary: 'Route Unavailable',
    }
  }

  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY

  // Normalize waypoints to guarantee valid latitude and longitude numbers
  const validWaypoints = (waypoints || [])
    .map(w => ({
      latitude: parseFloat(w?.latitude ?? w?.lat),
      longitude: parseFloat(w?.longitude ?? w?.lng),
    }))
    .filter(w => !isNaN(w.latitude) && !isNaN(w.longitude) && (w.latitude !== 0 || w.longitude !== 0))

  // 1. Try Google Directions API if key exists
  if (apiKey) {
    try {
      let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=driving&key=${apiKey}`
      if (validWaypoints.length > 0) {
        const wpStr = validWaypoints.map(w => `${w.latitude},${w.longitude}`).join('|')
        url += `&waypoints=${encodeURIComponent(wpStr)}`
      }

      const res = await fetch(url)
      const data = await res.json()

      if (data.status === 'OK' && data.routes?.[0]) {
        const route = data.routes[0]
        const points = decodePolyline(route.overview_polyline?.points)
        let totalDistanceMeters = 0
        let totalDurationSeconds = 0

        route.legs?.forEach(leg => {
          totalDistanceMeters += leg.distance?.value || 0
          totalDurationSeconds += leg.duration?.value || 0
        })

        return {
          coordinates: points,
          distanceKm: parseFloat((totalDistanceMeters / 1000).toFixed(1)),
          durationMins: Math.ceil(totalDurationSeconds / 60),
          summary: route.summary || 'Fastest Route',
        }
      }
    } catch (e) {
      console.warn('Google Directions API failed, falling back to OSRM:', e.message)
    }
  }

  // 2. Fallback: Free Open Source Routing Machine (OSRM)
  try {
    let locString = `${origin.longitude},${origin.latitude}`
    if (validWaypoints.length > 0) {
      locString += ';' + validWaypoints.map(w => `${w.longitude},${w.latitude}`).join(';')
    }
    locString += `;${destination.longitude},${destination.latitude}`

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${locString}?overview=full&geometries=geojson`
    const osrmRes = await fetch(osrmUrl)
    const osrmData = await osrmRes.json()

    if (osrmData.code === 'Ok' && osrmData.routes?.[0]) {
      const route = osrmData.routes[0]
      const coords = route.geometry.coordinates.map(c => ({
        latitude: c[1],
        longitude: c[0],
      }))

      return {
        coordinates: coords,
        distanceKm: parseFloat((route.distance / 1000).toFixed(1)),
        durationMins: Math.ceil(route.duration / 60),
        summary: route.legs?.[0]?.summary || 'Driving Route',
      }
    }
  } catch (e) {
    console.warn('OSRM Route fallback failed:', e.message)
  }

  // 3. Fallback: Straight-line interpolated route geometry
  const dist = calculateDistanceKm(origin.latitude, origin.longitude, destination.latitude, destination.longitude)
  return {
    coordinates: generateFallbackRoute(origin, destination),
    distanceKm: parseFloat(dist.toFixed(1)),
    durationMins: Math.ceil(dist * 2.5), // approx 2.5 mins per km
    summary: 'Direct Path',
  }
}
