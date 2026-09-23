import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import { fetchRouteDirections, calculateBearing, calculateDistanceKm } from '../../services/directionService'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const LiveTripMap = ({
  origin,
  destination,
  driverLocation,
  waypoints = [],
  role = 'customer', // 'customer' | 'driver'
  status = 'driver_assigned',
  driverInfo = null,
  height = 280,
  showNavigationButton = true,
  onRecenter,
}) => {
  const mapRef = useRef(null)
  const [routeCoords, setRouteCoords] = useState([])
  const [routeInfo, setRouteInfo] = useState({ distanceKm: 0, durationMins: 0, summary: '' })
  const [loadingRoute, setLoadingRoute] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const lastFetchedTargetRef = useRef(null)

  // Normalize waypoints to guarantee valid latitude, longitude, and index labels
  const normalizedWaypoints = (waypoints || []).map((wp, idx) => ({
    latitude: parseFloat(wp?.latitude ?? wp?.lat),
    longitude: parseFloat(wp?.longitude ?? wp?.lng),
    address: wp?.address || `Stop ${idx + 1}`,
    index: idx + 1,
  })).filter(wp => !isNaN(wp.latitude) && !isNaN(wp.longitude) && (wp.latitude !== 0 || wp.longitude !== 0))

  // Determine active route endpoints based on trip phase
  // Phase 1 (Pickup Phase): Driver -> Customer Pickup
  // Phase 2 (Drop Phase / in_progress): Driver -> Customer Destination (via intermediate stops)
  const isDropPhase = ['trip_started', 'in_progress', 'TRIP_STARTED'].includes(status)

  const effectiveStart = driverLocation?.latitude && driverLocation?.longitude
    ? { latitude: driverLocation.latitude, longitude: driverLocation.longitude }
    : origin

  const effectiveEnd = isDropPhase ? destination : (origin || destination)

  // Fetch / update live road directions
  const updateRoute = useCallback(async () => {
    if (!effectiveStart?.latitude || !effectiveEnd?.latitude) return

    const targetKey = `${effectiveStart.latitude.toFixed(4)},${effectiveStart.longitude.toFixed(4)}->${effectiveEnd.latitude.toFixed(4)},${effectiveEnd.longitude.toFixed(4)}-wp${normalizedWaypoints.length}`
    
    // Avoid redundant calls if coordinates haven't meaningfully moved (>30m)
    if (lastFetchedTargetRef.current === targetKey && routeCoords.length > 0) return
    lastFetchedTargetRef.current = targetKey

    setLoadingRoute(true)
    try {
      const res = await fetchRouteDirections(effectiveStart, effectiveEnd, isDropPhase ? normalizedWaypoints : [])
      if (res.coordinates?.length > 0) {
        setRouteCoords(res.coordinates)
        setRouteInfo({
          distanceKm: res.distanceKm,
          durationMins: res.durationMins,
          summary: res.summary,
        })
      }
    } catch (err) {
      console.warn('LiveTripMap direction update failed:', err)
    } finally {
      setLoadingRoute(false)
    }
  }, [effectiveStart?.latitude, effectiveStart?.longitude, effectiveEnd?.latitude, effectiveEnd?.longitude, isDropPhase, normalizedWaypoints])

  useEffect(() => {
    updateRoute()
  }, [updateRoute])

  // Fit map viewport to encompass both driver and destination
  const fitMapBounds = useCallback(() => {
    if (!mapRef.current || !mapReady) return

    const pointsToFit = []
    if (effectiveStart?.latitude) pointsToFit.push(effectiveStart)
    if (effectiveEnd?.latitude) pointsToFit.push(effectiveEnd)
    if (origin?.latitude) pointsToFit.push(origin)
    if (destination?.latitude) pointsToFit.push(destination)
    if (normalizedWaypoints?.length > 0) pointsToFit.push(...normalizedWaypoints)

    if (pointsToFit.length >= 2) {
      mapRef.current.fitToCoordinates(pointsToFit, {
        edgePadding: { top: 70, right: 50, bottom: 80, left: 50 },
        animated: true,
      })
    } else if (pointsToFit.length === 1) {
      mapRef.current.animateToRegion({
        latitude: pointsToFit[0].latitude,
        longitude: pointsToFit[0].longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }, 500)
    }
  }, [mapReady, effectiveStart, effectiveEnd, origin, destination, normalizedWaypoints])

  useEffect(() => {
    if (mapReady) {
      const timer = setTimeout(fitMapBounds, 600)
      return () => clearTimeout(timer)
    }
  }, [mapReady, routeCoords])

  // Calculate live bearing angle for car icon orientation
  const carRotation = driverLocation?.heading || calculateBearing(
    effectiveStart?.latitude,
    effectiveStart?.longitude,
    effectiveEnd?.latitude,
    effectiveEnd?.longitude
  ) || 0

  // Open Turn-by-Turn GPS Navigation in Google Maps app
  const openTurnByTurnNavigation = () => {
    if (!effectiveEnd?.latitude || !effectiveEnd?.longitude) return
    const lat = effectiveEnd.latitude
    const lng = effectiveEnd.longitude
    const label = encodeURIComponent(isDropPhase ? 'Customer Dropoff' : 'Customer Pickup')

    const url = Platform.select({
      ios: `maps://app?daddr=${lat},${lng}&dirflg=d`,
      android: `google.navigation:q=${lat},${lng}&mode=d`,
    }) || `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`

    Linking.canOpenURL(url)
      .then(supported => {
        if (supported) {
          Linking.openURL(url)
        } else {
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`)
        }
      })
      .catch(() => {
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`)
      })
  }

  // Live ETA calculation fallback
  const liveDist = routeInfo.distanceKm || (effectiveStart && effectiveEnd ? calculateDistanceKm(effectiveStart.latitude, effectiveStart.longitude, effectiveEnd.latitude, effectiveEnd.longitude).toFixed(1) : 0)
  const liveEta = routeInfo.durationMins || Math.ceil(liveDist * 2.5) || 3

  const targetTitle = isDropPhase ? 'Dropoff Destination' : 'Customer Pickup'
  const targetColor = isDropPhase ? '#EF4444' : '#10B981'

  const initialRegion = {
    latitude: effectiveStart?.latitude || 12.9716,
    longitude: effectiveStart?.longitude || 77.5946,
    latitudeDelta: 0.035,
    longitudeDelta: 0.035,
  }

  return (
    <View style={[styles.wrapper, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        onMapReady={() => setMapReady(true)}
        showsUserLocation={false}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {/* Route Direction Polyline (Outer Glow + Inner Core) */}
        {routeCoords.length > 1 && (
          <>
            <Polyline
              coordinates={routeCoords}
              strokeColor="rgba(79, 70, 229, 0.35)"
              strokeWidth={8}
            />
            <Polyline
              coordinates={routeCoords}
              strokeColor="#4F46E5"
              strokeWidth={4.5}
            />
          </>
        )}

        {/* 1. Driver Moving Car Marker */}
        {driverLocation?.latitude && (
          <Marker
            coordinate={{
              latitude: driverLocation.latitude,
              longitude: driverLocation.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={carRotation}
            zIndex={20}
          >
            <View style={styles.carMarkerContainer}>
              <View style={styles.carMarkerPulse} />
              <View style={styles.carMarkerBadge}>
                <Ionicons name="car-sport" size={18} color="#FFFFFF" />
              </View>
            </View>
          </Marker>
        )}

        {/* 2. Customer Pickup Pin (Green) */}
        {origin?.latitude && (
          <Marker
            coordinate={{
              latitude: origin.latitude,
              longitude: origin.longitude,
            }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={15}
          >
            <View style={styles.pinWrapper}>
              <View style={[styles.pinBubble, { backgroundColor: '#10B981' }]}>
                <Text style={styles.pinText}>Pickup</Text>
              </View>
              <View style={[styles.pinDot, { borderColor: '#10B981' }]}>
                <Ionicons name="location" size={24} color="#10B981" />
              </View>
            </View>
          </Marker>
        )}

        {/* 3. Destination Dropoff Pin (Red) */}
        {destination?.latitude && (
          <Marker
            coordinate={{
              latitude: destination.latitude,
              longitude: destination.longitude,
            }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={15}
          >
            <View style={styles.pinWrapper}>
              <View style={[styles.pinBubble, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.pinText}>Dropoff</Text>
              </View>
              <View style={[styles.pinDot, { borderColor: '#EF4444' }]}>
                <Ionicons name="flag" size={20} color="#EF4444" />
              </View>
            </View>
          </Marker>
        )}

        {/* 4. Intermediate Stops (If any) */}
        {normalizedWaypoints.map((wp, idx) => (
          <Marker
            key={`stop-${idx}-${wp.latitude}-${wp.longitude}`}
            coordinate={{ latitude: wp.latitude, longitude: wp.longitude }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={14}
          >
            <View style={styles.pinWrapper}>
              <View style={[styles.pinBubble, { backgroundColor: '#D97706' }]}>
                <Text style={styles.pinText}>Stop {wp.index}</Text>
              </View>
              <View style={[styles.pinDot, { borderColor: '#D97706', backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="location" size={22} color="#D97706" />
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Floating Top Banner: Live Direction & Distance HUD */}
      <View style={styles.topHudCard}>
        <View style={styles.topHudLeft}>
          <View style={[styles.targetIndicatorDot, { backgroundColor: targetColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.targetLabelText} numberOfLines={1}>
              {role === 'driver'
                ? `Navigating to: ${targetTitle}`
                : isDropPhase
                  ? 'Trip in Progress • Heading to Drop'
                  : 'Driver is on the way to Pickup'}
            </Text>
            <Text style={styles.targetSubText} numberOfLines={1}>
              {isDropPhase ? (destination?.address || 'Destination') : (origin?.address || 'Pickup Point')}
            </Text>
          </View>
        </View>

        <View style={styles.hudEtaBadge}>
          <Text style={styles.hudEtaMins}>{liveEta} min</Text>
          <Text style={styles.hudDistKm}>{liveDist} km</Text>
        </View>
      </View>

      {/* Floating Bottom Control Actions */}
      <View style={styles.bottomControlsRow}>
        {/* GPS Recenter Viewport Button */}
        <TouchableOpacity
          style={styles.floatingActionBtn}
          onPress={fitMapBounds}
          activeOpacity={0.85}
          title="Fit Route to View"
        >
          <Ionicons name="scan-outline" size={18} color="#4F46E5" />
          <Text style={styles.floatingActionText}>Recenter</Text>
        </TouchableOpacity>

        {/* Launch Native Turn-by-Turn GPS Button (for Driver) */}
        {role === 'driver' && showNavigationButton && (
          <TouchableOpacity
            style={[styles.floatingActionBtn, styles.navigateGpsBtn]}
            onPress={openTurnByTurnNavigation}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={18} color="#FFFFFF" />
            <Text style={[styles.floatingActionText, { color: '#FFFFFF', fontWeight: '800' }]}>
              Start GPS Guidance
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Loading overlay indicator */}
      {loadingRoute && routeCoords.length === 0 && (
        <View style={styles.loadingRouteOverlay}>
          <ActivityIndicator size="small" color="#4F46E5" />
          <Text style={styles.loadingRouteText}>Computing route direction...</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.md,
  },
  carMarkerContainer: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carMarkerPulse: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(79, 70, 229, 0.25)',
  },
  carMarkerBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...SHADOW.md,
  },
  pinWrapper: {
    alignItems: 'center',
  },
  pinBubble: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 2,
    ...SHADOW.sm,
  },
  pinText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  pinDot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHudCard: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    ...SHADOW.md,
  },
  topHudLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 10,
  },
  targetIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  targetLabelText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  targetSubText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  hudEtaBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  hudEtaMins: {
    fontSize: 12,
    fontWeight: '900',
    color: '#4F46E5',
    lineHeight: 14,
  },
  hudDistKm: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6366F1',
  },
  bottomControlsRow: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  floatingActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.md,
  },
  navigateGpsBtn: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
    flex: 1,
    justifyContent: 'center',
  },
  floatingActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  loadingRouteOverlay: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  loadingRouteText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4F46E5',
  },
})

export default LiveTripMap
