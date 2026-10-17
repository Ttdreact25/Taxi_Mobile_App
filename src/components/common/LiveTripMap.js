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
import UniversalRouteMap from './UniversalRouteMap'
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
  const isDropPhase = ['trip_started', 'in_progress', 'TRIP_STARTED'].includes(status)

  const hasDriverCoord = !!(driverLocation?.latitude && driverLocation?.longitude)
  const distDriverToPickup = (hasDriverCoord && origin?.latitude)
    ? calculateDistanceKm(driverLocation.latitude, driverLocation.longitude, origin.latitude, origin.longitude)
    : 0

  // Intelligent Route Endpoints:
  // If driver is away from pickup (> 0.5km) in pickup phase, start at driver and route to destination through pickup.
  // Otherwise, route from origin directly to destination so the full trip path is always drawn!
  const effectiveStart = isDropPhase
    ? (hasDriverCoord ? driverLocation : origin)
    : ((hasDriverCoord && distDriverToPickup > 0.5) ? driverLocation : origin)

  const effectiveEnd = destination || origin

  const effectiveWaypoints = isDropPhase
    ? normalizedWaypoints
    : ((hasDriverCoord && distDriverToPickup > 0.5 && origin?.latitude)
        ? [{ latitude: origin.latitude, longitude: origin.longitude, address: origin.address || 'Pickup' }, ...normalizedWaypoints]
        : normalizedWaypoints)

  // Fetch / update live road directions
  const updateRoute = useCallback(async () => {
    if (!effectiveStart?.latitude || !effectiveEnd?.latitude) return

    const targetKey = `${effectiveStart.latitude.toFixed(4)},${effectiveStart.longitude.toFixed(4)}->${effectiveEnd.latitude.toFixed(4)},${effectiveEnd.longitude.toFixed(4)}-wp${effectiveWaypoints.length}`
    
    // Avoid redundant calls if coordinates haven't meaningfully moved (>30m)
    if (lastFetchedTargetRef.current === targetKey && routeCoords.length > 0) return
    lastFetchedTargetRef.current = targetKey

    setLoadingRoute(true)
    try {
      const res = await fetchRouteDirections(effectiveStart, effectiveEnd, effectiveWaypoints)
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
  }, [effectiveStart?.latitude, effectiveStart?.longitude, effectiveEnd?.latitude, effectiveEnd?.longitude, effectiveWaypoints])

  useEffect(() => {
    updateRoute()
  }, [updateRoute])

  // Fit map viewport to encompass driver, pickup, and destination
  const fitMapBounds = useCallback(() => {
    if (!mapRef.current) return

    const pointsToFit = []
    if (origin?.latitude && origin?.longitude) pointsToFit.push(origin)
    if (destination?.latitude && destination?.longitude) pointsToFit.push(destination)
    if (driverLocation?.latitude && driverLocation?.longitude) pointsToFit.push(driverLocation)
    if (normalizedWaypoints?.length > 0) pointsToFit.push(...normalizedWaypoints)

    if (pointsToFit.length >= 2) {
      mapRef.current.fitToCoordinates(pointsToFit, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      })
    } else if (pointsToFit.length === 1) {
      mapRef.current.animateToRegion({
        latitude: pointsToFit[0].latitude,
        longitude: pointsToFit[0].longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 500)
    }
  }, [origin, destination, driverLocation, normalizedWaypoints])

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
    const navTarget = (!isDropPhase && distDriverToPickup > 0.2)
      ? origin
      : (normalizedWaypoints.length > 0 ? normalizedWaypoints[0] : effectiveEnd)

    if (!navTarget?.latitude || !navTarget?.longitude) return
    const lat = navTarget.latitude
    const lng = navTarget.longitude

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

  // Live HUD calculations
  let displayTitle = ''
  let displaySubtitle = ''
  let displayDist = 0
  let displayEta = 0
  const targetColor = isDropPhase ? '#EF4444' : (distDriverToPickup <= 0.4 ? '#3B82F6' : '#10B981')

  if (isDropPhase) {
    displayTitle = role === 'driver' ? 'Navigating to: Dropoff Destination' : 'Trip in Progress • Heading to Drop'
    displaySubtitle = destination?.address || 'Destination'
    displayDist = routeInfo.distanceKm || (origin && destination ? calculateDistanceKm(origin.latitude, origin.longitude, destination.latitude, destination.longitude).toFixed(1) : 0)
    displayEta = routeInfo.durationMins || Math.ceil(displayDist * 2.5) || 10
  } else if (hasDriverCoord && distDriverToPickup > 0.4) {
    displayTitle = role === 'driver' ? 'Navigating to: Customer Pickup' : 'Driver is on the way to Pickup'
    displaySubtitle = origin?.address || 'Pickup Point'
    displayDist = distDriverToPickup.toFixed(1)
    displayEta = Math.ceil(distDriverToPickup * 2.5) || 2
  } else {
    // Driver is at or near pickup point
    displayTitle = role === 'driver' ? 'At Customer Pickup • Heading to Drop' : 'Driver Arrived at Pickup Point'
    displaySubtitle = destination?.address || origin?.address || 'Destination'
    displayDist = routeInfo.distanceKm || (origin && destination ? calculateDistanceKm(origin.latitude, origin.longitude, destination.latitude, destination.longitude).toFixed(1) : 0)
    displayEta = routeInfo.durationMins || Math.ceil(displayDist * 2.5) || 15
  }

  const initialRegion = {
    latitude: effectiveStart?.latitude || origin?.latitude || 13.0827,
    longitude: effectiveStart?.longitude || origin?.longitude || 80.2707,
    latitudeDelta: 0.035,
    longitudeDelta: 0.035,
  }

  return (
    <View style={[styles.wrapper, { height }]}>
      <UniversalRouteMap
        ref={mapRef}
        pickupCoords={origin}
        destCoords={destination}
        driverLocation={driverLocation?.latitude ? { latitude: driverLocation.latitude, longitude: driverLocation.longitude, heading: carRotation } : null}
        waypoints={normalizedWaypoints}
        routeCoordinates={routeCoords}
        initialRegion={initialRegion}
        style={{ width: '100%', height: '100%' }}
        onMapReady={() => {
          setMapReady(true)
          fitMapBounds()
        }}
      />

      {/* Floating Top Banner: Live Direction & Distance HUD */}
      <View style={styles.topHudCard}>
        <View style={styles.topHudLeft}>
          <View style={[styles.targetIndicatorDot, { backgroundColor: targetColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.targetLabelText} numberOfLines={1}>
              {displayTitle}
            </Text>
            <Text style={styles.targetSubText} numberOfLines={1}>
              {displaySubtitle}
            </Text>
          </View>
        </View>

        <View style={styles.hudEtaBadge}>
          <Text style={styles.hudEtaMins}>{displayEta} min</Text>
          <Text style={styles.hudDistKm}>{displayDist} km</Text>
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
          <Ionicons name="scan-outline" size={18} color="#D97706" />
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
          <ActivityIndicator size="small" color="#D97706" />
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
    backgroundColor: '#F1F5F9',
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
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
  },
  carMarkerBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D97706',
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
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  hudEtaMins: {
    fontSize: 12,
    fontWeight: '900',
    color: '#B45309',
    lineHeight: 14,
  },
  hudDistKm: {
    fontSize: 9,
    fontWeight: '700',
    color: '#D97706',
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
    backgroundColor: '#0F172A',
    borderColor: '#1E293B',
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
    color: '#D97706',
  },
})

export default LiveTripMap
