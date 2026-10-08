import React, { useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ImageBackground,
  Image,
  Dimensions,
  StatusBar,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

export const SplashScreen = ({
  subtitle = 'Your Journey, Our Responsibility',
  onFinish,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const logoScale = useRef(new Animated.Value(0.85)).current
  const progressAnim = useRef(new Animated.Value(0)).current
  const taglineSlide = useRef(new Animated.Value(20)).current

  useEffect(() => {
    // 1. Entrance animation (fade in + logo spring)
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(taglineSlide, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start()

    // 2. Progress bar animation (filling over 2.4s then triggering onFinish)
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 2400,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && onFinish) {
        onFinish()
      }
    })
  }, [onFinish])

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 140],
  })

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Cinematic Mountain Highway Sunrise Wallpaper */}
      <ImageBackground
        source={require('../../../assets/splash_bg.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        {/* Top Vignette Overlay for High Legibility */}
        <View style={styles.topVignette} />

        {/* Bottom Vignette Overlay for Footer Contrast */}
        <View style={styles.bottomVignette} />

        {/* ── Top Section: Logo & Brand Header ── */}
        <Animated.View
          style={[
            styles.headerWrap,
            {
              opacity: fadeAnim,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          {/* Logo Badge with Golden Ring */}
          <View style={styles.logoBadgeContainer}>
            <View style={styles.logoRing}>
              <Image
                source={require('../../../assets/CityOneTaxi.png')}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
          </View>

          {/* Brand Title with Accent Lines */}
          <View style={styles.brandTitleRow}>
            <View style={styles.accentLine} />
            <Text style={styles.brandTitle}>
              CITYONE <Text style={styles.brandTitleGold}>TAXI</Text>
            </Text>
            <View style={styles.accentLine} />
          </View>

          {/* Subtitle / Tagline */}
          <Animated.Text
            style={[
              styles.subtitleText,
              { transform: [{ translateY: taglineSlide }] },
            ]}
          >
            {subtitle}
          </Animated.Text>
        </Animated.View>

        {/* ── Bottom Section: Catchphrase & Animated Progress Bar ── */}
        <Animated.View style={[styles.bottomWrap, { opacity: fadeAnim }]}>
          {/* Golden Stylized Catchphrase */}
          <View style={styles.catchphraseBox}>
            <Text style={styles.catchphraseLine1}>Safe Rides</Text>
            <Text style={styles.catchphraseLine2}>Happy Journeys</Text>
          </View>

          {/* Animated Glowing Progress Bar */}
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                { width: progressWidth },
              ]}
            />
          </View>

          {/* Footer Sub-Note */}
          <View style={styles.footerNoteRow}>
            <Ionicons name="shield-checkmark" size={13} color="#FBBF24" />
            <Text style={styles.footerNoteText}>
              Tamil Nadu's No. 1 Trusted Taxi Network
            </Text>
          </View>
        </Animated.View>
      </ImageBackground>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  backgroundImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.38,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  bottomVignette: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.42,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },

  // ── Top Header ──
  headerWrap: {
    alignItems: 'center',
    paddingTop: Math.max(StatusBar.currentHeight || 0, 52),
    paddingHorizontal: 24,
    zIndex: 10,
  },
  logoBadgeContainer: {
    marginBottom: 12,
  },
  logoRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 0,
    shadowColor: '#FFC700',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 6,
  },
  accentLine: {
    width: 24,
    height: 1.5,
    backgroundColor: '#F59E0B',
    opacity: 0.8,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  brandTitleGold: {
    color: '#FBBF24',
  },
  subtitleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E2E8F0',
    letterSpacing: 1.2,
    textTransform: 'capitalize',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  // ── Bottom Catchphrase & Progress Bar ──
  bottomWrap: {
    alignItems: 'center',
    paddingBottom: Math.max(StatusBar.currentHeight || 0, 44),
    paddingHorizontal: 24,
    zIndex: 10,
    width: '100%',
  },
  catchphraseBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  catchphraseLine1: {
    fontSize: 32,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#FCD34D',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  catchphraseLine2: {
    fontSize: 34,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#FBBF24',
    letterSpacing: 1.4,
    marginTop: -4,
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  progressBarTrack: {
    width: 140,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  footerNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    opacity: 0.92,
  },
  footerNoteText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#CBD5E1',
    letterSpacing: 0.6,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
})

export default SplashScreen
