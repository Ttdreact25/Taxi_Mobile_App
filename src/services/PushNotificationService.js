import { Platform, Vibration } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { authAPI, saveFcmToken } from '../api/api'

const FCM_TOKEN_KEY = 'cabtaxi_fcm_token'
export const TAXI_ALERTS_CHANNEL_ID = 'taxi_emergency_dispatch_v3'

// Safely load expo-notifications so Expo Go or clients without native push modules don't crash
let Notifications = null
try {
  Notifications = require('expo-notifications')
} catch (err) {
  // Expo Go or missing native module (e.g. ExpoTopicSubscriptionModule)
  console.log('[PushNotificationService] Native expo-notifications not available in current client')
}

// Configure how notifications behave when the app is in the foreground
if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    })
  } catch (e) {}
}

export const PushNotificationService = {
  /**
   * Configure high-priority Android notification channel with sound & vibration
   */
  setupAndroidNotificationChannels: async () => {
    if (Platform.OS !== 'android' || !Notifications?.setNotificationChannelAsync) return
    try {
      await Notifications.setNotificationChannelAsync(TAXI_ALERTS_CHANNEL_ID, {
        name: 'Taxi Ride Emergency Alerts & Dispatch',
        description: 'Heads-up alert banner, ringtone, and vibration for ride requests and assignments',
        importance: Notifications.AndroidImportance?.MAX || 5,
        vibrationPattern: [0, 800, 300, 800, 300, 1000],
        lightColor: '#F59E0B',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility?.PUBLIC || 1,
        bypassDnd: true,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage?.ALARM || 4,
          contentType: Notifications.AndroidAudioContentType?.SONIFICATION || 4,
        },
      })

      await Notifications.setNotificationChannelAsync('default', {
        name: 'General Alerts',
        importance: Notifications.AndroidImportance?.HIGH || 4,
        sound: 'default',
        enableVibrate: true,
      })
    } catch (e) {
      console.warn('Failed to configure Android notification channel:', e)
    }
  },

  /**
   * Request permissions, obtain Expo Push Token and sync with backend
   */
  registerForPushNotifications: async () => {
    if (Platform.OS === 'web' || !Notifications?.getPermissionsAsync) {
      try {
        const existing = await SecureStore.getItemAsync(FCM_TOKEN_KEY)
        if (existing) return existing
      } catch {}
      return null
    }

    try {
      await PushNotificationService.setupAndroidNotificationChannels()

      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }

      if (finalStatus !== 'granted') {
        console.log('[PushNotificationService] Push notification permission was not granted by user')
        return null
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        Constants.easConfig?.projectId ||
        'bc277ed2-5ce7-4f47-a176-19f631fc6bac'

      const tokenResponse = await Notifications.getExpoPushTokenAsync({
        projectId,
      })
      const token = tokenResponse?.data

      if (token) {
        await saveFcmToken(token)
        try {
          await authAPI.updateFcmToken(token)
        } catch (apiErr) {
          // May fail if user is not yet authenticated; will sync upon login
        }
        return token
      }
    } catch (error) {
      // In Expo Go SDK 53+, remote push notifications are not supported directly in the Expo Go client
      console.log('[PushNotificationService] Push registration note (Expo Go):', error?.message || error)
      try {
        const existing = await SecureStore.getItemAsync(FCM_TOKEN_KEY)
        if (existing) return existing
      } catch {}
    }
    return null
  },

  /**
   * Trigger local high-priority alert when driver arrives
   */
  showLocalArrivalNotification: async (title = 'Driver Reached', body = 'Your driver has arrived at your pickup location.', data = {}) => {
    try {
      Vibration.vibrate([0, 500, 200, 500])
    } catch {}
    if (!Notifications?.scheduleNotificationAsync) return
    try {
      await PushNotificationService.setupAndroidNotificationChannels()
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority?.MAX || 2,
          channelId: TAXI_ALERTS_CHANNEL_ID,
          vibrate: [0, 500, 200, 500],
          data: { type: 'driver_arrived', ...data },
        },
        trigger: null,
      })
    } catch (e) {
      console.warn('Error showing local arrival notification:', e)
    }
  },

  /**
   * Trigger local high-priority alert when a new booking is received by driver
   */
  showLocalBookingAlertNotification: async (title = 'Booking Received', body = 'New ride request received. Tap to accept.', data = {}) => {
    try {
      Vibration.vibrate([0, 800, 300, 800, 300, 1000])
    } catch {}
    if (!Notifications?.scheduleNotificationAsync) return
    try {
      await PushNotificationService.setupAndroidNotificationChannels()
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority?.MAX || 2,
          channelId: TAXI_ALERTS_CHANNEL_ID,
          vibrate: [0, 800, 300, 800, 300, 1000],
          data: { type: 'booking_received', ...data },
        },
        trigger: null,
      })
    } catch (e) {
      console.warn('Error showing local booking alert notification:', e)
    }
  },

  handleIncomingNotification: (notification) => {
    console.log('Incoming push notification:', notification)
  },
}

export default PushNotificationService
