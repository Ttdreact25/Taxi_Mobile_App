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

/**
 * Play urgent Driver Ride Alert Sound (Assign & Dispatch Alert)
 */
export const playDriverAlertSound = async () => {
  // Always trigger strong haptic vibration pattern
  try {
    Vibration.vibrate([0, 800, 200, 800, 200, 800, 200, 800])
  } catch (e) {}

  await initAudioMode()

  // 1. Modern expo-audio (SDK 52+)
  if (ExpoAudio?.createAudioPlayer) {
    try {
      if (activePlayer) {
        try {
          activePlayer.pause?.()
          activePlayer.remove?.()
        } catch {}
        activePlayer = null
      }

      const player = ExpoAudio.createAudioPlayer(require('../../assets/sounds/driver_alert.wav'))
      activePlayer = player
      player.volume = 1.0
      player.play()

      try {
        player.addListener?.('playbackStatusUpdate', (status) => {
          if (status?.didJustFinish) {
            try { player.remove?.() } catch {}
            if (activePlayer === player) activePlayer = null
          }
        })
      } catch {}
      return
    } catch (e) {
      console.warn('[SoundService] expo-audio failed, falling back:', e?.message)
    }
  }

  // 2. Legacy expo-av fallback
  if (ExpoAudio?.Audio?.Sound?.createAsync) {
    try {
      if (activePlayer) {
        try {
          await activePlayer.stopAsync?.()
          await activePlayer.unloadAsync?.()
        } catch {}
        activePlayer = null
      }

      const { sound } = await ExpoAudio.Audio.Sound.createAsync(
        require('../../assets/sounds/driver_alert.wav'),
        { shouldPlay: true, volume: 1.0 }
      )
      activePlayer = sound
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {})
          if (activePlayer === sound) activePlayer = null
        }
      })
      return
    } catch (e) {
      console.warn('[SoundService] expo-av failed:', e?.message)
    }
  }

  // 3. Web Audio fallback
  if (Platform.OS === 'web') {
    playWebAudioTone('driver')
  }
}

/**
 * Universal Audio Player helper for Expo SDK audio
 */
export const playAudioFile = async (audioSource, volume = 1.0) => {
  await initAudioMode()

  // 1. Modern expo-audio (SDK 52+)
  if (ExpoAudio?.createAudioPlayer) {
    try {
      if (activePlayer) {
        try {
          activePlayer.pause?.()
          activePlayer.remove?.()
        } catch {}
        activePlayer = null
      }
      const player = ExpoAudio.createAudioPlayer(audioSource)
      activePlayer = player
      player.volume = volume
      player.play()
      try {
        player.addListener?.('playbackStatusUpdate', (status) => {
          if (status?.didJustFinish) {
            try { player.remove?.() } catch {}
            if (activePlayer === player) activePlayer = null
          }
        })
      } catch {}
      return player
    } catch (e) {
      console.warn('[SoundService] expo-audio player error:', e?.message)
    }
  }

  // 2. Legacy expo-av fallback
  if (ExpoAudio?.Audio?.Sound?.createAsync) {
    try {
      if (activePlayer) {
        try {
          await activePlayer.stopAsync?.()
          await activePlayer.unloadAsync?.()
        } catch {}
        activePlayer = null
      }
      const { sound } = await ExpoAudio.Audio.Sound.createAsync(
        audioSource,
        { shouldPlay: true, volume }
      )
      activePlayer = sound
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status?.didJustFinish) {
          sound.unloadAsync().catch(() => {})
          if (activePlayer === sound) activePlayer = null
        }
      })
      return sound
    } catch (e) {
      console.warn('[SoundService] expo-av error:', e?.message)
    }
  }
}

/**
 * High-Volume Driver Alert for New Bookings: Urgent Alarm + Loud Voice "Booking Received!"
 */
export const playDriverBookingReceived = async (bookingRef = '') => {
  try {
    // 1. Multi-burst vibration
    Vibration.vibrate([0, 800, 250, 800, 250, 800, 250, 800])

    // 2. Play maximum volume alarm chime
    await playDriverAlertSound()

    // 3. Play generated studio voice audio: "Booking received! Booking received! New ride assigned."
    setTimeout(async () => {
      try {
        await playAudioFile(require('../../assets/sounds/booking_received.mp3'), 1.0)
      } catch (ae) {
        speakVoiceAlert('Booking received! Booking received! New ride assigned.')
      }
    }, 350)

    // 4. Loud speech synthesis reinforcement for maximum clarity
    setTimeout(() => {
      speakVoiceAlert('Booking received! Booking received! New ride assigned.')
    }, 1800)

    // 5. Trigger immediate local notification banner
    PushNotificationService.showLocalBookingAlertNotification(
      '🚗 New Booking Received!',
      `Booking received ${bookingRef ? '#' + bookingRef : ''}. Tap to view and accept.`
    )
  } catch (e) {
    console.warn('[SoundService] playDriverBookingReceived error:', e)
  }
}

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

  if (ExpoAudio?.Audio?.Sound?.createAsync) {
    try {
      const { sound } = await ExpoAudio.Audio.Sound.createAsync(
        require('../../assets/sounds/admin_booking.wav'),
        { shouldPlay: true, volume: 1.0, isLooping: false }
      )
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {})
        }
      })
      return
    } catch (e) {}
  }

  if (Platform.OS === 'web') {
    playWebAudioTone('booking')
  }
}

/**
 * Customer Alert: Plays loud arrival chime + Loud Voice Announcement: "Driver reached!"
 * Also triggers OS-level heads-up notification
 */
export const playCustomerTaxiReachedAlert = async (driverName = '', vehicleDesc = '') => {
  try {
    // 1. Double vibration burst
    Vibration.vibrate([0, 600, 200, 600, 200, 600])

    // 2. Play arrival chime
    await playBookingNotificationSound()

    // 3. Play generated studio voice audio: "Driver reached! Driver reached! Your driver has arrived at the pickup location."
    setTimeout(async () => {
      try {
        await playAudioFile(require('../../assets/sounds/driver_reached.mp3'), 1.0)
      } catch (ae) {
        speakVoiceAlert('Driver reached! Driver reached! Your driver has arrived at the pickup location.')
      }
    }, 350)

    // 4. Loud Voice Announcement reinforcement
    setTimeout(() => {
      const announcement = driverName
        ? `Driver reached! Driver ${driverName} has arrived at your pickup location.`
        : 'Driver reached! Your driver has arrived at the pickup location.'
      speakVoiceAlert(announcement)
    }, 1800)

    // 5. Trigger OS-level notification
    PushNotificationService.showLocalArrivalNotification(
      '🚖 Driver Reached! Driver Has Arrived',
      driverName ? `Driver ${driverName} ${vehicleDesc ? `(${vehicleDesc})` : ''} has reached your pickup point.` : 'Your driver has reached your pickup location. Please board the cab.'
    )
  } catch (e) {
    console.warn('[SoundService] playCustomerTaxiReachedAlert error:', e)
  }
}

/**
 * Stop any active playing sound
 */
export const stopActiveSound = async () => {
  if (activePlayer) {
    try {
      activePlayer.pause?.()
      activePlayer.remove?.()
      activePlayer.stopAsync?.()
      activePlayer.unloadAsync?.()
    } catch (e) {}
    activePlayer = null
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
