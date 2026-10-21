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
import * as ExpoSplashScreen from 'expo-splash-screen'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

export const SplashScreen = ({
  subtitle = 'Your Journey, Our Responsibility',
  onFinish,
}) => {
  const onFinishRef = useRef(onFinish)
  useEffect(() => {
    onFinishRef.current = onFinish
  }, [onFinish])

  const fadeAnim = useRef(new Animated.Value(0)).current
  const logoScale = useRef(new Animated.Value(0.85)).current
  const pulseAnim = useRef(new Animated.Value(1)).current
  const progressAnim = useRef(new Animated.Value(0)).current
  const textSlide = useRef(new Animated.Value(20)).current

  useEffect(() => {
    // Hide native splash screen seamlessly now that React Native splash screen is mounted
    ExpoSplashScreen.hideAsync().catch(() => {})

    let finished = false
    const finishSafely = () => {
      if (!finished) {
        finished = true
        if (onFinishRef.current) onFinishRef.current()
      }
    }

    const fallbackTimer = setTimeout(finishSafely, 2600)

    try {
      // 1. Entrance animation (fade in + logo spring)
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 7,
          tension: 45,
          useNativeDriver: true,
        }),
        Animated.timing(textSlide, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start()

      // 2. Subtle continuous breathing pulse on halo
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start()

      // 3. Progress bar animation - 1800ms full smooth fill-up
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: false,
      }).start(({ finished: animFinished }) => {
        if (animFinished) {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start(() => finishSafely())
        }
      })
    } catch {
      finishSafely()
    }

    return () => clearTimeout(fallbackTimer)
  }, [])

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200],
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
        {/* Dark Film Noir Gradient Overlays */}
        <View style={styles.topVignette} />
        <View style={styles.centerBackdrop} />
        <View style={styles.bottomVignette} />

        {/* ── Center Hero Section: Official Emblem ── */}
        <Animated.View
          style={[
            styles.centerSection,
            {
              opacity: fadeAnim,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          {/* Top Eyebrow Tag */}
          <View style={styles.eyebrowTag}>
            <Text style={styles.eyebrowStar}>★</Text>
            <Text style={styles.eyebrowText}>TAMIL NADU'S TRUSTED NETWORK</Text>
            <Text style={styles.eyebrowStar}>★</Text>
          </View>

          {/* Animated Glowing Golden Halo behind the badge */}
          <View style={styles.badgeWrapper}>
            <Animated.View
              style={[
                styles.glowingHalo,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />

            {/* Official 3D Circular Logo Emblem */}
            <View style={styles.logoBadgeContainer}>
              <Image
                source={require('../../../assets/cityonetaxi_badge.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Tagline & Accent Bar */}
          <Animated.View style={{ alignItems: 'center', transform: [{ translateY: textSlide }] }}>
            <View style={styles.accentRow}>
              <View style={styles.goldLine} />
              <View style={styles.goldDot} />
              <View style={styles.goldLine} />
            </View>

            <Text style={styles.subtitleText}>{subtitle}</Text>

            {/* Feature Highlights Chip */}
            <View style={styles.highlightPill}>
              <Text style={styles.highlightText}> Fast Cabs</Text>
              <Text style={styles.highlightDot}>•</Text>
              <Text style={styles.highlightText}> Safe Travel</Text>
              <Text style={styles.highlightDot}>•</Text>
              <Text style={styles.highlightText}> Best Fares</Text>
            </View>
          </Animated.View>
        </Animated.View>

        {/* ── Bottom Section: Loading Indicator & Reassurance ── */}
        <Animated.View style={[styles.bottomWrap, { opacity: fadeAnim }]}>
          {/* Progress Bar Container */}
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                { width: progressWidth },
              ]}
            />
          </View>

          <Text style={styles.loadingStatusText}>Preparing your seamless journey...</Text>

          {/* Footer Sub-Note */}
          <View style={styles.footerNoteRow}>
            <View style={styles.verifiedCheckBadge}>
              <Text style={styles.verifiedCheckText}>✓</Text>
            </View>
            <Text style={styles.footerNoteText}>
              Official 24x7 Cab Service • Live GPS Tracking
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
    height: SCREEN_HEIGHT * 0.35,
    backgroundColor: 'rgba(11, 15, 25, 0.65)',
  },
  centerBackdrop: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.25,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.5,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  bottomVignette: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.38,
    backgroundColor: 'rgba(11, 15, 25, 0.78)',
  },

  // ── Center Section ──
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 10,
    marginTop: 20,
  },
  eyebrowTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.45)',
    marginBottom: 20,
  },
  eyebrowStar: {
    fontSize: 10,
    color: '#FBBF24',
    fontWeight: '900',
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FDE68A',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  badgeWrapper: {
    width: 204,
    height: 204,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 18,
  },
  glowingHalo: {
    position: 'absolute',
    width: 216,
    height: 216,
    borderRadius: 108,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(251, 191, 36, 0.4)',
  },
  logoBadgeContainer: {
    width: 188,
    height: 188,
    borderRadius: 94,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.65,
    shadowRadius: 24,
    elevation: 18,
  },
  logoImage: {
    width: 188,
    height: 188,
  },
  accentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  goldLine: {
    width: 28,
    height: 1.5,
    backgroundColor: '#F59E0B',
    opacity: 0.85,
  },
  goldDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FBBF24',
  },
  subtitleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 1.2,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: 14,
  },
  highlightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  highlightText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#E2E8F0',
    letterSpacing: 0.3,
  },
  highlightDot: {
    fontSize: 10,
    color: '#F59E0B',
    fontWeight: '900',
  },

  // ── Bottom Wrap ──
  bottomWrap: {
    alignItems: 'center',
    paddingBottom: Math.max(StatusBar.currentHeight || 0, 42),
    paddingHorizontal: 24,
    zIndex: 10,
    width: '100%',
  },
  progressBarTrack: {
    width: 200,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 8,
  },
  loadingStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.6,
    marginBottom: 14,
  },
  footerNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  verifiedCheckBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedCheckText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  footerNoteText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#CBD5E1',
    letterSpacing: 0.5,
  },
})

export default SplashScreen
