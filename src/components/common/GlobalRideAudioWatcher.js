import React, { useEffect, useRef, useCallback } from 'react'
import { AppState, Platform } from 'react-native'
import * as Location from 'expo-location'
import { useAuth } from '../../context/AuthContext'
import { bookingsAPI, driverAPI } from '../../api/api'
import { playCustomerTaxiReachedAlert, playDriverBookingReceived } from '../../services/SoundService'
import PushNotificationService from '../../services/PushNotificationService'

let Notifications = null
try {
  Notifications = require('expo-notifications')
} catch (e) {}

let ExpoAudio = null
try {
  ExpoAudio = require('expo-audio')
} catch (e) {}

/**
 * Global Background Ride & Booking Audio Watcher
 * Guarantees that:
 * 1. Customer hears "Driver reached!" regardless of which screen they are on or if the app is minimized.
 * 2. Driver hears "Booking received!" regardless of which screen they are on or if the app is minimized.
 * 3. Uses Android Background GPS Watcher to keep polling alive when app is minimized.
 */
const GlobalRideAudioWatcher = () => {
  const { user } = useAuth()
  const alertedArrivedTripIdRef = useRef(null)
  const alertedDriverRideIdRef = useRef(null)
  const pollTimerRef = useRef(null)
  const isPollingBusyRef = useRef(false)

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

    const subscription = AppState.addEventListener('change', () => {
      configureAudioMode()
    })

    return () => {
      subscription.remove()
    }
  }, [])

  // 2. Play audible voice/chime alerts immediately when a Push Notification is received
  useEffect(() => {
    if (!user?.id || !Notifications?.addNotificationReceivedListener) return

    let notifSubscription = null
    try {
      notifSubscription = Notifications.addNotificationReceivedListener((notification) => {
        const title = (notification?.request?.content?.title || '').toLowerCase()
        const data = notification?.request?.content?.data || {}
        const type = (data?.type || '').toLowerCase()

        if (type === 'driver_arrived' || title.includes('arrived') || title.includes('reached')) {
          playCustomerTaxiReachedAlert(data?.ref_id || 'arrived').catch(() => {})
        } else if (
          type === 'booking_received' ||
          type === 'booking_assigned' ||
          title.includes('booking') ||
          title.includes('ride request')
        ) {
          playDriverBookingReceived(data?.ref_id || 'booking').catch(() => {})
        }
      })
    } catch (e) {}

    return () => {
      if (notifSubscription && typeof notifSubscription.remove === 'function') {
        notifSubscription.remove()
      }
    }
  }, [user?.id])

  // Core background checker function
  const pollBackgroundRideEvents = useCallback(async () => {
    if (!user?.id || isPollingBusyRef.current) return
    isPollingBusyRef.current = true

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
            playCustomerTaxiReachedAlert(active.id, active.driver_name, active.plate_no || active.model).catch(() => {})
            PushNotificationService.showLocalArrivalNotification(
              'Driver Reached',
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
              playDriverBookingReceived(pId).catch(() => {})
              PushNotificationService.showLocalBookingAlertNotification(
                'Booking Received',
                `New ride request ${firstPending.booking_ref ? '#' + firstPending.booking_ref : ''}. Tap to accept.`
              )
            }
          }

          // B. Direct Driver Assigned Trip
          if (activeTrip?.status === 'driver_assigned') {
            const aId = activeTrip.id || activeTrip.booking_id
            if (aId && alertedDriverRideIdRef.current !== `assigned_${aId}`) {
              alertedDriverRideIdRef.current = `assigned_${aId}`
              playDriverBookingReceived(aId).catch(() => {})
              PushNotificationService.showLocalBookingAlertNotification(
                'Booking Assigned',
                `You have been assigned to ride ${activeTrip.booking_ref ? '#' + activeTrip.booking_ref : ''}.`
              )
            }
          }
        }
      }
    } catch (err) {
      // Silent catch
    } finally {
      isPollingBusyRef.current = false
    }
  }, [user])

  // 3. Keep polling alive when minimized via GPS background subscription
  useEffect(() => {
    if (!user?.id || Platform.OS === 'web') return

    let locationSub = null
    let isActive = true

    const enableBackgroundKeepAlive = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync()
        if (status !== 'granted') return
        if (!isActive) return

        locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 4000,
            distanceInterval: 1,
          },
          () => {
            // Fired by OS GPS even when app is minimized / in background
            pollBackgroundRideEvents()
          }
        )
      } catch (e) {}
    }

    enableBackgroundKeepAlive()

    return () => {
      isActive = false
      if (locationSub && typeof locationSub.remove === 'function') {
        locationSub.remove()
      }
    }
  }, [user?.id, pollBackgroundRideEvents])

  // 4. Foreground High-Frequency Timer
  useEffect(() => {
    if (!user?.id) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      return
    }

    const initialTimeout = setTimeout(pollBackgroundRideEvents, 1500)
    pollTimerRef.current = setInterval(pollBackgroundRideEvents, 3500)

    return () => {
      clearTimeout(initialTimeout)
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [user?.id, pollBackgroundRideEvents])

  return null
}

export default GlobalRideAudioWatcher
