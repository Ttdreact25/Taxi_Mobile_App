import React, { useEffect, useRef } from 'react'
import { AppState, Platform, Vibration } from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { bookingsAPI, driverAPI } from '../../api/api'
import { playCustomerTaxiReachedAlert, playDriverAlertSound, playDriverBookingReceived } from '../../services/SoundService'
import PushNotificationService from '../../services/PushNotificationService'

let ExpoAudio = null
try {
  ExpoAudio = require('expo-audio')
} catch (e) {}

/**
 * Global Background Ride & Booking Audio Watcher
 * Guarantees that:
 * 1. Customer hears "Driver reached!" regardless of which screen they are on or if the app is minimized.
 * 2. Driver hears "Booking received!" regardless of which screen they are on or if the app is minimized.
 */
const GlobalRideAudioWatcher = () => {
  const { user } = useAuth()
  const alertedArrivedTripIdRef = useRef(null)
  const alertedDriverRideIdRef = useRef(null)
  const pollTimerRef = useRef(null)

  // 1. Maintain background audio permissions on AppState transitions
  useEffect(() => {
    const configureAudioMode = async () => {
      if (Platform.OS === 'web') return
      try {
        if (ExpoAudio?.setAudioModeAsync) {
          await ExpoAudio.setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: 'duckOthers',
          })
        }
      } catch (e) {}
    }

    configureAudioMode()

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      configureAudioMode()
    })

    return () => {
      subscription.remove()
    }
  }, [])

  // 2. Global background polling watcher for Customer & Driver
  useEffect(() => {
    if (!user?.id) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      return
    }

    const pollBackgroundRideEvents = async () => {
      try {
        const isCustomer = user.role_slug === 'customer' || !user.role_slug
        const isDriver = user.role_slug === 'driver'

        // ── CUSTOMER GLOBAL WATCHER ──────────────────────────────────────
        if (isCustomer) {
          const tripRes = await bookingsAPI.myTrips({ per_page: 3 })
          const trips = tripRes.data?.bookings || []
          const active = trips.find(t =>
            ['searching', 'accepted', 'arrived', 'in_progress', 'driver_assigned', 'driver_arrived', 'trip_started'].includes(t.status)
          )

          if (active) {
            const isArrived = active.status === 'driver_arrived' || active.status === 'arrived'
            if (isArrived && alertedArrivedTripIdRef.current !== active.id) {
              alertedArrivedTripIdRef.current = active.id
              // Play high-clarity Arrival Master Audio + Speech announcement
              playCustomerTaxiReachedAlert(active.driver_name, active.plate_no || active.model).catch(() => {})
              PushNotificationService.showLocalArrivalNotification(
                '🚖 Driver Reached!',
                `Driver ${active.driver_name || 'Partner'} has arrived at your pickup point.`
              )
            }
          }
        }

        // ── DRIVER GLOBAL WATCHER ────────────────────────────────────────
        if (isDriver) {
          const dashRes = await driverAPI.dashboard()
          const dData = dashRes.data || {}
          const isOnline = Boolean(dData.driver?.is_online || dData.is_online)

          if (isOnline) {
            const pendingRides = dData.pending_rides || []
            const activeTrip = dData.active_trip || dData.active_booking || null

            // A. Incoming Pending Ride
            if (pendingRides.length > 0) {
              const firstPending = pendingRides[0]
              const pId = firstPending.id || firstPending.booking_id
              if (pId && alertedDriverRideIdRef.current !== `pending_${pId}`) {
                alertedDriverRideIdRef.current = `pending_${pId}`
                playDriverAlertSound().catch(() => {})
                PushNotificationService.showLocalBookingAlertNotification(
                  '🚗 New Booking Received!',
                  `New ride request ${firstPending.booking_ref ? '#' + firstPending.booking_ref : ''}. Tap to accept.`
                )
              }
            }

            // B. Direct Driver Assigned Trip
            if (activeTrip?.status === 'driver_assigned') {
              const aId = activeTrip.id || activeTrip.booking_id
              if (aId && alertedDriverRideIdRef.current !== `assigned_${aId}`) {
                alertedDriverRideIdRef.current = `assigned_${aId}`
                playDriverAlertSound().catch(() => {})
                PushNotificationService.showLocalBookingAlertNotification(
                  '🚗 New Booking Assigned!',
                  `You have been assigned to ride ${activeTrip.booking_ref ? '#' + activeTrip.booking_ref : ''}.`
                )
              }
            }
          }
        }
      } catch (err) {
        // Silent catch for network hiccups during background polling
      }
    }

    // Run first check after 2s, then every 4s
    const initialTimeout = setTimeout(pollBackgroundRideEvents, 2000)
    pollTimerRef.current = setInterval(pollBackgroundRideEvents, 4000)

    return () => {
      clearTimeout(initialTimeout)
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [user])

  return null // Headless background audio runner
}

export default GlobalRideAudioWatcher
