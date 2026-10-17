import React, { useRef, useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  Vibration,
  ActivityIndicator,
  Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const THUMB_SIZE = 48
const TRACK_PADDING = 4
const TRACK_HEIGHT = 56
const THUMB_TOP = 4

export default function SwipeToActionButton({
  title = 'SWIPE TO START TRIP',
  onSwipeComplete,
  isLoading = false,
  trackBg = '#16A34A',
  thumbBg = '#FFFFFF',
  thumbIconColor = '#15803D',
  icon = 'arrow-forward',
  resetKey = null,
}) {
  const [trackWidth, setTrackWidth] = useState(SCREEN_WIDTH - 32)
  const [isCompleted, setIsCompleted] = useState(false)

  const maxDistanceRef = useRef(Math.max(160, SCREEN_WIDTH - 32 - THUMB_SIZE - TRACK_PADDING * 2))
  const isExecutingRef = useRef(false)
  const isLoadingRef = useRef(isLoading)
  const hasMovedRef = useRef(false)
  const pan = useRef(new Animated.Value(0)).current

  useEffect(() => {
    isLoadingRef.current = isLoading
    if (!isLoading) {
      resetSlider()
    }
  }, [isLoading, title, resetKey])

  const resetSlider = () => {
    isExecutingRef.current = false
    setIsCompleted(false)
    hasMovedRef.current = false
    Animated.spring(pan, {
      toValue: 0,
      friction: 8,
      tension: 65,
      useNativeDriver: false,
    }).start()
  }

  // Shimmer pulse animation for chevrons
  const pulseAnim = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [])

  const handleLayout = (e) => {
    const width = e.nativeEvent?.layout?.width
    if (width > 0) {
      setTrackWidth(width)
      maxDistanceRef.current = Math.max(0, width - THUMB_SIZE - TRACK_PADDING * 2)
    }
  }

  const triggerSuccess = () => {
    if (isExecutingRef.current || isLoadingRef.current) return
    isExecutingRef.current = true
    setIsCompleted(true)

    try {
      Vibration.vibrate(60)
    } catch {}

    const targetDistance = maxDistanceRef.current > 0 ? maxDistanceRef.current : 240
    Animated.timing(pan, {
      toValue: targetDistance,
      duration: 180,
      useNativeDriver: false,
    }).start(() => {
      try {
        if (typeof onSwipeComplete === 'function') {
          onSwipeComplete()
        }
      } catch (e) {
        console.warn('onSwipeComplete callback error:', e)
      }
      // Safety reset fallback if loading state isn't managed externally
      setTimeout(() => {
        if (!isLoadingRef.current) {
          resetSlider()
        }
      }, 1500)
    })
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isLoadingRef.current,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return !isLoadingRef.current && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.vx) > 0.1)
      },
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        // Capture horizontal movements early so parent ScrollView does not intercept
        return !isLoadingRef.current && Math.abs(gesture.dx) > 3
      },
      onPanResponderGrant: () => {
        if (isExecutingRef.current || isLoadingRef.current) return
        hasMovedRef.current = false
        pan.stopAnimation()
      },
      // CRITICAL: NEVER allow parent ScrollView to steal gesture once user interacts with swipe
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        if (isLoadingRef.current || isExecutingRef.current) return
        if (gesture.dx > 4) {
          hasMovedRef.current = true
        }
        const maxDist = maxDistanceRef.current > 0 ? maxDistanceRef.current : 240
        const clampedX = Math.max(0, Math.min(gesture.dx, maxDist))
        pan.setValue(clampedX)
      },
      onPanResponderRelease: (_, gesture) => {
        if (isLoadingRef.current || isExecutingRef.current) return
        const maxDist = maxDistanceRef.current > 0 ? maxDistanceRef.current : 240

        // Completion Criteria:
        // 1) Dragged at least 20% of the track OR min 30px
        // 2) Fast flick to the right (vx > 0.15 and dx >= 18)
        // 3) Tap on button (dx < 10 and dy < 10) -> auto-slides and triggers!
        const threshold = Math.max(30, maxDist * 0.20)
        const isFlick = gesture.vx > 0.15 && gesture.dx >= 18
        const isDragComplete = gesture.dx >= threshold || isFlick
        const isTap = Math.abs(gesture.dx) < 10 && Math.abs(gesture.dy) < 10

        if (isDragComplete || isTap) {
          triggerSuccess()
        } else {
          hasMovedRef.current = false
          Animated.spring(pan, {
            toValue: 0,
            friction: 8,
            tension: 65,
            useNativeDriver: false,
          }).start()
        }
      },
      onPanResponderTerminate: () => {
        if (!isExecutingRef.current) {
          resetSlider()
        }
      },
    })
  ).current

  const textOpacity = pan.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0.05],
    extrapolate: 'clamp',
  })

  // Dynamic progress track width behind thumb
  const progressWidth = pan.interpolate({
    inputRange: [0, Math.max(1, maxDistanceRef.current)],
    outputRange: [0, trackWidth || SCREEN_WIDTH - 32],
    extrapolate: 'clamp',
  })

  return (
    <View style={styles.outerContainer} collapsable={false}>
      <View
        style={[styles.track, { backgroundColor: trackBg, borderColor: trackBg }]}
        onLayout={handleLayout}
        collapsable={false}
        {...panResponder.panHandlers}
      >
        {/* Dynamic Highlight Fill Behind Slider */}
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: progressWidth,
              backgroundColor: 'rgba(255, 255, 255, 0.24)',
            },
          ]}
          pointerEvents="none"
        />

        {/* Centered Title & Animated Chevrons */}
        <Animated.View style={[styles.textOverlay, { opacity: textOpacity }]} pointerEvents="none">
          <View style={styles.textInnerRow}>
            <Text
              style={styles.mainTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {isLoading ? 'PROCESSING...' : title}
            </Text>
            {!isLoading && (
              <Animated.View style={[styles.chevronsRow, { opacity: pulseAnim }]}>
                <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.95)" />
                <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.75)" style={{ marginLeft: -7 }} />
                <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.55)" style={{ marginLeft: -7 }} />
              </Animated.View>
            )}
          </View>
        </Animated.View>

        {/* Circular Sliding Thumb */}
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: thumbBg,
              transform: [{ translateX: pan }],
            },
          ]}
          pointerEvents="none"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={thumbIconColor} />
          ) : (
            <View style={styles.thumbIconWrap}>
              <Ionicons name={icon} size={23} color={thumbIconColor} style={styles.thumbIcon} />
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  outerContainer: {
    marginVertical: 10,
    width: '100%',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: '#16A34A',
    borderWidth: 1.5,
    borderColor: '#15803D',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#15803D',
    borderRadius: TRACK_HEIGHT / 2,
  },
  textOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: THUMB_SIZE + 12,
  },
  textInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTitle: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  chevronsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
  },
  thumb: {
    position: 'absolute',
    top: THUMB_TOP,
    left: TRACK_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
  },
  thumbIconWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIcon: {
    marginTop: -1.5,
  },
})
