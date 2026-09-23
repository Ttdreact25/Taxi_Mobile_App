import * as Location from 'expo-location'

export const LocationService = {
  requestPermission: async () => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    return status === 'granted'
  },

  getCurrentLocation: async () => {
    const hasPerm = await LocationService.requestPermission()
    if (!hasPerm) return null
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    }
  },

  reverseGeocode: async (latitude, longitude) => {
    try {
      const res = await Location.reverseGeocodeAsync({ latitude, longitude })
      if (res[0]) {
        const a = res[0]
        return [a.street, a.district, a.city, a.region].filter(Boolean).join(', ')
      }
    } catch {}
    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
  }
}
