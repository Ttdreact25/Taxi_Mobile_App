import React, { useRef, useEffect } from 'react'
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
} from 'react-native'
import { COLORS, RADIUS, SHADOW } from '../../constants/theme'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

/**
 * Modern Draggable Bottom Sheet with Smooth Physics & Snapping
 * 
 * @param {Array<number>} snapPoints - Height values from bottom, e.g. [140, 420, 680]
 * @param {number} initialIndex - Default active snap point index
 * @param {function} onSnap - Callback when snapped (index)
 * @param {ReactNode} children - Bottom sheet content
 */
export default function ModernBottomSheet({
  snapPoints = [160, 440, SCREEN_HEIGHT * 0.85],
  initialIndex = 1,
  onSnap,
  children,
  style,
}) {
  const currentSnapIndex = useRef(initialIndex)
  const panY = useRef(new Animated.Value(-snapPoints[initialIndex])).current

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 6
      },
      onPanResponderGrant: () => {
        panY.extractOffset()
      },
      onPanResponderMove: (_, gestureState) => {
        // Inverted: dragging down adds positive dy, which reduces sheet height
        panY.setValue(-gestureState.dy)
      },
      onPanResponderRelease: (_, gestureState) => {
        panY.flattenOffset()
        const currentY = -panY._value // current height value

        // Determine nearest snap point based on position and velocity
        let targetIndex = currentSnapIndex.current

        if (gestureState.vy > 0.5) {
          // Fast swipe down
          targetIndex = Math.max(0, currentSnapIndex.current - 1)
        } else if (gestureState.vy < -0.5) {
          // Fast swipe up
          targetIndex = Math.min(snapPoints.length - 1, currentSnapIndex.current + 1)
        } else {
          // Snap to closest height point
          let minDiff = Infinity
          snapPoints.forEach((point, idx) => {
            const diff = Math.abs(point - currentY)
            if (diff < minDiff) {
              minDiff = diff
              targetIndex = idx
            }
          })
        }

        snapToIndex(targetIndex)
      },
    })
  ).current

  const snapToIndex = (index) => {
    const validIndex = Math.max(0, Math.min(snapPoints.length - 1, index))
    currentSnapIndex.current = validIndex
    const targetHeight = snapPoints[validIndex]

    Animated.spring(panY, {
      toValue: -targetHeight,
      useNativeDriver: false,
      tension: 65,
      friction: 11,
    }).start(() => {
      if (onSnap) onSnap(validIndex)
    })
  }

  // Update position if initialIndex or snapPoints change dynamically
  useEffect(() => {
    snapToIndex(initialIndex)
  }, [initialIndex])

  return (
    <Animated.View
      style={[
        styles.bottomSheetContainer,
        {
          height: panY.interpolate({
            inputRange: [-SCREEN_HEIGHT, 0],
            outputRange: [SCREEN_HEIGHT, 0],
            extrapolate: 'clamp',
          }),
        },
        style,
      ]}
    >
      {/* Draggable Handle Bar */}
      <View {...panResponder.panHandlers} style={styles.handleHitSlop}>
        <View style={styles.handleBar} />
      </View>

      {/* Sheet Content */}
      <View style={styles.contentWrap}>{children}</View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  bottomSheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xxl || 28,
    borderTopRightRadius: RADIUS.xxl || 28,
    ...SHADOW.lg,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 20,
    zIndex: 99,
    overflow: 'hidden',
  },
  handleHitSlop: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1', // Slate 300
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
})
