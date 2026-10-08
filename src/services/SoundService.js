import { Platform, Vibration, NativeModules } from 'react-native'

let AudioModule = null
try {
  if (NativeModules && NativeModules.ExponentAV) {
    const expoAv = require('expo-av')
    if (expoAv && expoAv.Audio) {
      AudioModule = expoAv.Audio
    }
  }
} catch (e) {
  AudioModule = null
}

let activeSoundObject = null

/**
 * Configure audio mode for Expo / React Native
 */
const initAudioMode = async () => {
  if (AudioModule && Platform.OS !== 'web') {
    try {
      await AudioModule.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      })
    } catch (e) {
      // Ignore mode config errors
    }
  }
}

initAudioMode().catch(() => {})

/**
 * Fallback Web Audio API synthesizer for web or simulator
 */
const playWebAudioTone = (pattern = 'driver') => {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
    const now = ctx.currentTime

    if (pattern === 'driver') {
      // 3 urgent alert beeps (880Hz, 1175Hz, 1320Hz)
      const tones = [
        { f: 880, start: 0.0, dur: 0.18 },
        { f: 1175, start: 0.22, dur: 0.18 },
        { f: 1320, start: 0.44, dur: 0.25 },
        { f: 1175, start: 0.72, dur: 0.18 },
        { f: 1320, start: 0.94, dur: 0.30 },
      ]
      tones.forEach(t => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(t.f, now + t.start)
        gain.gain.setValueAtTime(0.4, now + t.start)
        gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + t.start)
        osc.stop(now + t.start + t.dur)
      })
    } else {
      // Pleasant chime (523Hz -> 659Hz -> 784Hz)
      const tones = [
        { f: 523.25, start: 0.0, dur: 0.3 },
        { f: 659.25, start: 0.15, dur: 0.35 },
        { f: 783.99, start: 0.35, dur: 0.5 },
      ]
      tones.forEach(t => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(t.f, now + t.start)
        gain.gain.setValueAtTime(0.35, now + t.start)
        gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + t.start)
        osc.stop(now + t.start + t.dur)
      })
    }
  } catch (e) {
    console.warn('Web Audio fallback error:', e)
  }
}

/**
 * Play urgent Driver Ride Alert Sound (Assign & Dispatch Alert)
 */
export const playDriverAlertSound = async () => {
  // Always trigger haptic vibration
  try {
    Vibration.vibrate([0, 600, 200, 600, 200, 600])
  } catch (e) {}

  // If in web browser, use Web Audio API directly
  if (Platform.OS === 'web') {
    playWebAudioTone('driver')
    return
  }

  // Native iOS / Android via expo-av
  if (AudioModule) {
    try {
      if (activeSoundObject) {
        try {
          await activeSoundObject.stopAsync()
          await activeSoundObject.unloadAsync()
        } catch (e) {}
        activeSoundObject = null
      }

      const { sound } = await AudioModule.Sound.createAsync(
        require('../../assets/sounds/driver_alert.wav'),
        { shouldPlay: true, volume: 1.0, isLooping: false }
      )
      activeSoundObject = sound

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {})
          if (activeSoundObject === sound) activeSoundObject = null
        }
      })
    } catch (e) {
      console.warn('Could not play native sound via expo-av, fallback to vibration:', e?.message)
      playWebAudioTone('driver')
    }
  } else {
    playWebAudioTone('driver')
  }
}

/**
 * Play pleasant Booking Notification Sound
 */
export const playBookingNotificationSound = async () => {
  try {
    Vibration.vibrate([0, 300, 150, 300])
  } catch (e) {}

  if (Platform.OS === 'web') {
    playWebAudioTone('booking')
    return
  }

  if (AudioModule) {
    try {
      const { sound } = await AudioModule.Sound.createAsync(
        require('../../assets/sounds/admin_booking.wav'),
        { shouldPlay: true, volume: 0.9, isLooping: false }
      )
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {})
        }
      })
    } catch (e) {
      playWebAudioTone('booking')
    }
  } else {
    playWebAudioTone('booking')
  }
}

/**
 * Stop any active playing sound
 */
export const stopActiveSound = async () => {
  if (activeSoundObject) {
    try {
      await activeSoundObject.stopAsync()
      await activeSoundObject.unloadAsync()
    } catch (e) {}
    activeSoundObject = null
  }
}

export default {
  playDriverAlertSound,
  playBookingNotificationSound,
  stopActiveSound,
}
