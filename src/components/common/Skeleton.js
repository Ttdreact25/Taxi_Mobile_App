import React, { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import { COLORS, RADIUS } from '../../constants/theme'

export const Skeleton = ({ width = '100%', height = 16, borderRadius = RADIUS.sm, style }) => {
  const opacity = useRef(new Animated.Value(0.35)).current

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  )
}

export const SkeletonCard = ({ style }) => {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.row}>
        <Skeleton width={44} height={44} borderRadius={RADIUS.md} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Skeleton width="60%" height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="40%" height={10} />
        </View>
      </View>
      <View style={{ marginTop: 14 }}>
        <Skeleton width="90%" height={12} style={{ marginBottom: 6 }} />
        <Skeleton width="75%" height={12} />
      </View>
    </View>
  )
}

export const SkeletonList = ({ count = 3, style }) => {
  return (
    <View style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} style={{ marginBottom: 12 }} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E2E8F0',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})

export default Skeleton
