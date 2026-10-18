import { Platform, Vibration } from 'react-native'
import PushNotificationService from './PushNotificationService'

let ExpoAudio = null
try {
  ExpoAudio = require('expo-audio')
} catch (e1) {
  try {
    ExpoAudio = require('expo-av')
  } catch (e2) {}
}

let ExpoSpeech = null
try {
  ExpoSpeech = require('expo-speech')
} catch (e3) {}

let activePlayer = null
let isAudioConfigured = false

/**
 * Configure system audio mode so alert sounds play at maximum volume even if phone is on silent
 */
const initAudioMode = async () => {
  if (isAudioConfigured) return
  if (Platform.OS === 'web') return

  if (ExpoAudio?.setAudioModeAsync) {
    try {
      await ExpoAudio.setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'duckOthers',
      })
      isAudioConfigured = true
      return
    } catch (e) {}
  }

  if (ExpoAudio?.Audio?.setAudioModeAsync) {
    try {
      await ExpoAudio.Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: true,
      })
      isAudioConfigured = true
    } catch (e) {}
  }
}

initAudioMode().catch(() => {})

/**
 * High-Volume Voice Speech Alert
 */
export const speakVoiceAlert = (text, options = {}) => {
  if (!text) return
  try {
    if (ExpoSpeech?.speak) {
      ExpoSpeech.stop?.()
      ExpoSpeech.speak(text, {
        language: options.language || 'en-IN',
        pitch: options.pitch || 1.05,
        rate: options.rate || 0.95,
        volume: 1.0,
        ...options,
      })
    }
  } catch (e) {
    console.warn('[SoundService] Speech error:', e?.message)
  }
}

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
      // 5 urgent loud alert beeps
      const tones = [
        { f: 880, start: 0.0, dur: 0.20 },
        { f: 1175, start: 0.22, dur: 0.20 },
        { f: 1320, start: 0.44, dur: 0.28 },
        { f: 1175, start: 0.74, dur: 0.20 },
        { f: 1320, start: 0.96, dur: 0.35 },
      ]
      tones.forEach(t => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(t.f, now + t.start)
        gain.gain.setValueAtTime(1.0, now + t.start)
        gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + t.start)
        osc.stop(now + t.start + t.dur)
      })
    } else {
      const tones = [
        { f: 523.25, start: 0.0, dur: 0.35 },
        { f: 659.25, start: 0.18, dur: 0.38 },
        { f: 783.99, start: 0.38, dur: 0.60 },
      ]
      tones.forEach(t => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(t.f, now + t.start)
        gain.gain.setValueAtTime(0.9, now + t.start)
        gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + t.start)
        osc.stop(now + t.start + t.dur)
      })
    }
  } catch (e) {
    console.warn('Web Audio error:', e)
  }
}

// ── Global Sound Coordinator & Single-Instance Locks ─────────────
let activeAudioPlayer = null
let isPlayingDriverSound = false
let isPlayingCustomerSound = false
let lastDriverSoundTime = 0
let lastCustomerSoundTime = 0

// Permanent Session Cache: Ensures sounds play STRICTLY ONCE per booking/trip across the entire app session
const playedDriverBookingIds = new Set()
const playedCustomerArrivalTripIds = new Set()

/**
 * Unified Driver Booking Alert:
 * Plays the loud, clear voice alert: "Booking received! Booking received! New ride assigned."
 * STRICT REQUIREMENT: Plays EXACTLY 1 TIME when the booking request first arrives. Never repeats.
 */
export const playDriverBookingAlert = async (bookingIdOrRef = '') => {
  const idStr = bookingIdOrRef ? String(bookingIdOrRef).trim() : ''

  // Must have a valid booking ID, and must NOT have played for this booking before
  if (!idStr) return
  if (playedDriverBookingIds.has(idStr)) return

  // Register immediately to prevent race conditions from concurrent triggers
  playedDriverBookingIds.add(idStr)

  const now = Date.now()
  if (isPlayingDriverSound || (now - lastDriverSoundTime < 4000)) return

  isPlayingDriverSound = true
  lastDriverSoundTime = now

  // Strong vibration pattern
  try {
    Vibration.vibrate([0, 800, 200, 800, 200, 800, 200, 800])
  } catch (e) {}

  await initAudioMode()

  // 1. Modern expo-audio (SDK 52+)
  if (ExpoAudio?.createAudioPlayer) {
    try {
      if (activeAudioPlayer) {
        try { activeAudioPlayer.pause?.() } catch {}
        try { activeAudioPlayer.remove?.() } catch {}
        activeAudioPlayer = null
      }

      const player = ExpoAudio.createAudioPlayer(require('../../assets/sounds/driver_alert.wav'))
      activeAudioPlayer = player
      player.volume = 1.0
      player.play()

      try {
        player.addListener?.('playbackStatusUpdate', (status) => {
          if (status?.didJustFinish) {
            isPlayingDriverSound = false
            try { player.remove?.() } catch {}
            if (activeAudioPlayer === player) activeAudioPlayer = null
          }
        })
      } catch {}

      setTimeout(() => {
        isPlayingDriverSound = false
      }, 5000)
      return
    } catch (e) {
      console.warn('[SoundService] expo-audio driver alert error:', e?.message)
      isPlayingDriverSound = false
    }
  }

  // 2. Web Audio fallback
  if (Platform.OS === 'web') {
    playWebAudioTone('driver')
    setTimeout(() => { isPlayingDriverSound = false }, 3000)
  }
}

// Aliases ensuring all screens call the exact same protected function
export const playDriverAlertSound = playDriverBookingAlert
export const playDriverBookingReceived = playDriverBookingAlert

/**
 * Play pleasant Booking Notification Sound
 */
export const playBookingNotificationSound = async () => {
  try {
    Vibration.vibrate([0, 500, 200, 500])
  } catch (e) {}

  await initAudioMode()

  if (ExpoAudio?.createAudioPlayer) {
    try {
      const player = ExpoAudio.createAudioPlayer(require('../../assets/sounds/admin_booking.wav'))
      player.volume = 1.0
      player.play()
      return
    } catch (e) {}
  }

  if (Platform.OS === 'web') {
    playWebAudioTone('booking')
  }
}

/**
 * Unified Customer Arrival Alert:
 * Plays ONE single, crystal-clear voice alert: "Driver reached! Driver reached! Your driver has arrived..."
 * STRICT REQUIREMENT: Plays EXACTLY 1 TIME when the driver marks arrival at pickup. Never repeats.
 */
export const playCustomerTaxiReachedAlert = async (tripIdOrName = '', driverName = '', vehicleDesc = '') => {
  // Extract or normalize trip/booking identifier
  let tripId = ''
  if (tripIdOrName && typeof tripIdOrName === 'object') {
    tripId = String(tripIdOrName.id || tripIdOrName.booking_id || tripIdOrName.booking_ref || '').trim()
  } else if (tripIdOrName) {
    tripId = String(tripIdOrName).trim()
  } else if (driverName) {
    tripId = String(driverName).trim()
  }

  // Must have a valid identifier, and must NOT have played for this trip arrival before
  if (!tripId) return
  if (playedCustomerArrivalTripIds.has(tripId)) return

  // Register immediately to lock and prevent duplicate playback across screens
  playedCustomerArrivalTripIds.add(tripId)

  const now = Date.now()
  if (isPlayingCustomerSound || (now - lastCustomerSoundTime < 6000)) return

  isPlayingCustomerSound = true
  lastCustomerSoundTime = now

  // Double vibration burst
  try {
    Vibration.vibrate([0, 600, 200, 600, 200, 600])
  } catch (e) {}

  await initAudioMode()

  // 1. Play master driver_reached.wav
  if (ExpoAudio?.createAudioPlayer) {
    try {
      if (activeAudioPlayer) {
        try { activeAudioPlayer.pause?.() } catch {}
        try { activeAudioPlayer.remove?.() } catch {}
        activeAudioPlayer = null
      }

      const player = ExpoAudio.createAudioPlayer(require('../../assets/sounds/driver_reached.wav'))
      activeAudioPlayer = player
      player.volume = 1.0
      player.play()

      try {
        player.addListener?.('playbackStatusUpdate', (status) => {
          if (status?.didJustFinish) {
            isPlayingCustomerSound = false
            try { player.remove?.() } catch {}
            if (activeAudioPlayer === player) activeAudioPlayer = null
          }
        })
      } catch {}

      setTimeout(() => {
        isPlayingCustomerSound = false
      }, 6000)
      return
    } catch (e) {
      console.warn('[SoundService] Customer alert error:', e?.message)
      isPlayingCustomerSound = false
    }
  }

  // 2. Web Audio fallback
  if (Platform.OS === 'web') {
    playWebAudioTone('booking')
    setTimeout(() => { isPlayingCustomerSound = false }, 3000)
  }
}

/**
 * Universal Audio Player helper for audio sources
 */
export const playAudioFile = async (audioSource, volume = 1.0) => {
  await initAudioMode()
  if (ExpoAudio?.createAudioPlayer) {
    try {
      const player = ExpoAudio.createAudioPlayer(audioSource)
      player.volume = volume
      player.play()
      return player
    } catch (e) {
      console.warn('[SoundService] expo-audio player error:', e?.message)
    }
  }
  return null
}

/**
 * Stop any active playing sound
 */
export const stopActiveSound = async () => {
  if (activeAudioPlayer) {
    try {
      activeAudioPlayer.pause?.()
      activeAudioPlayer.remove?.()
      activeAudioPlayer.stopAsync?.()
      activeAudioPlayer.unloadAsync?.()
    } catch (e) {}
    activeAudioPlayer = null
  }
  try {
    ExpoSpeech?.stop?.()
  } catch {}
}

export default {
  playDriverAlertSound,
  playDriverBookingReceived,
  playBookingNotificationSound,
  playCustomerTaxiReachedAlert,
  playAudioFile,
  speakVoiceAlert,
  stopActiveSound,
}
