import { Platform } from 'react-native'
import * as TaskManager from 'expo-task-manager'
import * as Location from 'expo-location'
import { driverAPI } from '../api/api'
import { playDriverBookingReceived } from './SoundService'
import PushNotificationService from './PushNotificationService'

export const DRIVER_LOCATION_TASK = 'CITYONETAXI_DRIVER_BG_SERVICE'

let isTaskDefined = false
let lastAlertedRideId = null
let heartbeatTimer = null

/**
 * Common check function for incoming rides (called by task and heartbeat)
 */
export const checkDriverIncomingRides = async (coords = null) => {
  try {
    // 1. Update GPS position if available
    if (coords?.latitude && coords?.longitude) {
      driverAPI.updateLocation({
        lat: coords.latitude,
        lng: coords.longitude,
        heading: coords.heading || 0,
        speed: coords.speed || 0,
      }).catch(() => {})
    }

    // 2. Poll dashboard
    const dashRes = await driverAPI.dashboard()
    const dData = dashRes.data || {}
    const isOnline = Boolean(dData.driver?.is_online || dData.is_online)

    if (!isOnline) return

    const pendingRides = dData.pending_rides || []
    const activeTrip = dData.active_trip || dData.active_booking || null

    // A. Incoming Pending Ride
    if (pendingRides.length > 0) {
      const first = pendingRides[0]
      const pId = first.id || first.booking_id
      if (pId && lastAlertedRideId !== `pending_${pId}`) {
        lastAlertedRideId = `pending_${pId}`
        playDriverBookingReceived(pId).catch(() => {})
        PushNotificationService.showLocalBookingAlertNotification(
          '⚡ New Booking Received!',
          `New ride request ${first.booking_ref ? '#' + first.booking_ref : ''}. Tap to accept.`
        ).catch(() => {})
      }
    }

    // B. Direct Assigned Booking (Admin or Auto-assign)
    if (activeTrip?.status === 'driver_assigned') {
      const aId = activeTrip.id || activeTrip.booking_id
      if (aId && lastAlertedRideId !== `assigned_${aId}`) {
        lastAlertedRideId = `assigned_${aId}`
        playDriverBookingReceived(aId).catch(() => {})
        PushNotificationService.showLocalBookingAlertNotification(
          '🚖 Ride Assigned by Admin!',
          `You have been assigned to ride ${activeTrip.booking_ref ? '#' + activeTrip.booking_ref : ''}. Tap to view.`
        ).catch(() => {})
      }
    }

    // C. Scheduled / Admin Assigned Long Trips
    try {
      const schedRes = await driverAPI.assignedScheduledTrips()
      const sData = schedRes.data || {}
      const newAssignments = sData.new_assignments || []
      if (newAssignments.length > 0) {
        const firstSched = newAssignments[0]
        const sId = firstSched.long_trip_id || firstSched.id || firstSched.booking_id
        if (sId && lastAlertedRideId !== `sched_${sId}`) {
          lastAlertedRideId = `sched_${sId}`
          playDriverBookingReceived(sId).catch(() => {})
          PushNotificationService.showLocalBookingAlertNotification(
            '🚖 New Trip Assigned by Admin!',
            `Trip #${firstSched.booking_ref || sId} assigned to you. Tap to accept.`
          ).catch(() => {})
        }
      }
    } catch (se) {}
  } catch (err) {
    // Silent catch
  }
}

/**
 * Register Background Task with Android TaskManager
 */
export const initDriverForegroundTask = () => {
  if (isTaskDefined || Platform.OS === 'web') return
  try {
    TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
      if (error) return
      const coords = data?.locations?.[0]?.coords || null
      await checkDriverIncomingRides(coords)
    })
    isTaskDefined = true
  } catch (err) {
    console.warn('Could not define driver foreground task:', err)
  }
}

// Register task immediately at root import time
initDriverForegroundTask()

export const checkBackgroundPermission = async () => {
  if (Platform.OS !== 'android') return true
  try {
    const res = await Location.getBackgroundPermissionsAsync()
    return res.status === 'granted'
  } catch {
    return false
  }
}

/**
 * Start Android Foreground Service & Continuous Heartbeat when Driver goes Online
 */
export const startDriverForegroundService = async () => {
  if (Platform.OS === 'web') return { success: false, reason: 'web' }

  // Ensure notification channel exists
  PushNotificationService.setupAndroidNotificationChannels().catch(() => {})

  // Start continuous polling heartbeat
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      checkDriverIncomingRides().catch(() => {})
    }, 4000)
  }

  if (Platform.OS !== 'android') return { success: true }

  try {
    initDriverForegroundTask()

    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync()
    if (fgStatus !== 'granted') {
      return { success: false, reason: 'foreground_permission_denied' }
    }

    // Check & request background permission for persistent service while driver uses YouTube / other apps
    const bgStatus = await Location.getBackgroundPermissionsAsync()
    let isBgGranted = bgStatus.status === 'granted'
    if (!isBgGranted) {
      try {
        const bgReq = await Location.requestBackgroundPermissionsAsync()
        isBgGranted = bgReq.status === 'granted'
      } catch (bgErr) {}
    }

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)
    if (hasStarted) return { success: true, isBgGranted }

    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 4000,
      distanceInterval: 1,
      foregroundService: {
        notificationTitle: 'CityOneTaxi Driver is Online 🟢',
        notificationBody: 'Active & listening for ride alerts even while using YouTube...',
        notificationColor: '#F59E0B',
      },
    })
    return { success: true, isBgGranted: true }
  } catch (err) {
    console.warn('Failed to start driver foreground service:', err?.message || err)
    return { success: false, reason: err?.message || 'failed_to_start', isBgGranted: false }
  }
}

/**
 * Stop Android Foreground Service when Driver goes Offline
 */
export const stopDriverForegroundService = async () => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  if (Platform.OS !== 'android') return

  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK)
    }
  } catch (err) {}
}

export default {
  initDriverForegroundTask,
  checkDriverIncomingRides,
  startDriverForegroundService,
  stopDriverForegroundService,
}
