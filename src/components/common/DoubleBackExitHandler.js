import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  BackHandler,
  Platform,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

/**
 * Custom hook to handle Android "Press back again to exit"
 * Displays a luxury Flipkart-style floating pill with CityOneTaxi logo
 */
export const useDoubleBackExit = (bottomOffset = 95) => {
  const [visible, setVisible] = useState(false)
  const lastBackPress = useRef(0)
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(14)).current
  const hideTimer = useRef(null)

  const showToast = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(true)

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start()

    hideTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 14,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => setVisible(false))
    }, 2000)
  }, [fadeAnim, slideAnim])

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return

      const onBackPress = () => {
        const now = Date.now()
        if (now - lastBackPress.current < 2000) {
          BackHandler.exitApp()
          return true
        }

        lastBackPress.current = now
        showToast()
        return true
      }

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress
      )

      return () => {
        subscription.remove()
        if (hideTimer.current) clearTimeout(hideTimer.current)
      }
    }, [showToast])
  )

  const ExitToastComponent = visible ? (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toastWrapper,
        {
          bottom: bottomOffset,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.toastPill}>
        <View style={styles.logoBox}>
          <Image
            source={require('../../../assets/cityonetaxi_badge.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.toastText}>Press again to exit</Text>
      </View>
    </Animated.View>
  ) : null

  return { ExitToastComponent }
}

const styles = StyleSheet.create({
  toastWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999999,
    elevation: 999999,
  },
  toastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 20,
    borderRadius: 30,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 12,
  },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFC700',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  logoImg: {
    width: 28,
    height: 28,
  },
  toastText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
})

export default useDoubleBackExit
