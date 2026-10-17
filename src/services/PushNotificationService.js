import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const FCM_TOKEN_KEY = 'cabtaxi_fcm_token'

export const PushNotificationService = {
  registerForPushNotifications: async () => {
    try {
      const existing = await SecureStore.getItemAsync(FCM_TOKEN_KEY)
      if (existing) return existing
    } catch {}
    return null
  },

  showLocalArrivalNotification: async () => {},
  showLocalBookingAlertNotification: async () => {},
  handleIncomingNotification: (notification) => {
    console.log('Incoming push notification:', notification)
  }
}

export default PushNotificationService
