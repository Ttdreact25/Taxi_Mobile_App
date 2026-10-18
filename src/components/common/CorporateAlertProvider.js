import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Image,
  Alert,
  Dimensions,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SHADOW } from '../../constants/theme'

const CorporateAlertContext = createContext(null)

// Module-level imperative dispatcher
let globalAlertDispatcher = null

export const showCorporateAlert = (title, message, buttons = [{ text: 'OK' }], options = {}) => {
  if (globalAlertDispatcher) {
    globalAlertDispatcher(title, message, buttons, options)
  } else {
    Alert.alert(title, message, buttons, options)
  }
}

/**
 * Sanitizes any text string to ensure 100% formal English.
 * Strips any bilingual slash markers (e.g. "Title / தமிழ்") and Tamil unicode characters.
 */
const sanitizeToEnglish = (text) => {
  if (!text || typeof text !== 'string') return ''
  let cleaned = text

  // 1. If string contains a bilingual slash, extract the English part
  if (cleaned.includes(' / ')) {
    const parts = cleaned.split(' / ')
    if (parts[0] && /[a-zA-Z]/.test(parts[0])) {
      cleaned = parts[0]
    }
  }

  // 2. Remove any Tamil script characters (\u0B80 - \u0BFF)
  cleaned = cleaned.replace(/[\u0B80-\u0BFF]+/g, '').replace(/\s{2,}/g, ' ').trim()

  return cleaned
}

/**
 * Automatically detects notification classification for luxury styling & icons
 */
const detectAlertType = (title = '', message = '', buttons = []) => {
  const combined = (title + ' ' + message).toLowerCase()
  const hasDestructive = buttons?.some(b => b?.style === 'destructive')

  if (
    hasDestructive ||
    combined.includes('delete') ||
    combined.includes('remove') ||
    combined.includes('sign out') ||
    combined.includes('logout') ||
    combined.includes('erase') ||
    combined.includes('permanently')
  ) {
    return 'destructive'
  }

  if (
    combined.includes('error') ||
    combined.includes('failed') ||
    combined.includes('invalid') ||
    combined.includes('rejected') ||
    combined.includes('cannot') ||
    combined.includes('unable') ||
    combined.includes('rejected')
  ) {
    return 'error'
  }

  if (
    combined.includes('success') ||
    combined.includes('verified') ||
    combined.includes('welcome') ||
    combined.includes('confirmed') ||
    combined.includes('received') ||
    combined.includes('approved') ||
    combined.includes('saved') ||
    combined.includes('completed') ||
    combined.includes('done')
  ) {
    return 'success'
  }

  if (
    combined.includes('required') ||
    combined.includes('missing') ||
    combined.includes('warning') ||
    combined.includes('attention') ||
    combined.includes('permission') ||
    combined.includes('please check')
  ) {
    return 'warning'
  }

  return 'info'
}

export const CorporateAlertProvider = ({ children }) => {
  const [alertConfig, setAlertConfig] = useState(null)
  const [visible, setVisible] = useState(false)

  const scaleAnim = useRef(new Animated.Value(0.85)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  const closeAlert = useCallback((callback) => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.88,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false)
      setAlertConfig(null)
      if (typeof callback === 'function') {
        callback()
      }
    })
  }, [scaleAnim, opacityAnim])

  const openAlert = useCallback((rawTitle, rawMessage, rawButtons, options) => {
    const cleanTitle = sanitizeToEnglish(rawTitle) || 'Notification'
    const cleanMessage = sanitizeToEnglish(rawMessage)

    // Normalize buttons
    let buttons = []
    if (Array.isArray(rawButtons) && rawButtons.length > 0) {
      buttons = rawButtons
    } else if (typeof rawButtons === 'object' && rawButtons !== null && rawButtons.text) {
      buttons = [rawButtons]
    } else {
      buttons = [{ text: 'Got It' }]
    }

    const type = detectAlertType(cleanTitle, cleanMessage, buttons)

    setAlertConfig({
      title: cleanTitle,
      message: cleanMessage,
      buttons,
      type,
      options,
    })

    setVisible(true)
    scaleAnim.setValue(0.85)
    opacityAnim.setValue(0)

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start()
  }, [scaleAnim, opacityAnim])

  // Mount global handler and patch Alert.alert globally across the app
  useEffect(() => {
    const originalAlert = Alert.alert

    globalAlertDispatcher = openAlert

    Alert.alert = (title, message, buttons, options) => {
      openAlert(title, message, buttons, options)
    }

    return () => {
      globalAlertDispatcher = null
      Alert.alert = originalAlert
    }
  }, [openAlert])

  const type = alertConfig?.type || 'info'

  // Visual Palette Configuration
  const theme = {
    success: {
      accentColor: '#10B981',
      ringBg: '#ECFDF5',
      ringBorder: '#A7F3D0',
      squareBg: '#FFC700',
      pipBg: '#10B981',
      pipIcon: 'checkmark-sharp',
      tagText: 'VERIFIED & CONFIRMED',
      tagColor: '#059669',
      tagBg: '#ECFDF5',
      tagBorder: '#A7F3D0',
      btnBg: '#FFC700',
      btnText: '#0F172A',
    },
    warning: {
      accentColor: '#F59E0B',
      ringBg: '#FFFBEB',
      ringBorder: '#FDE68A',
      squareBg: '#FFC700',
      pipBg: '#D97706',
      pipIcon: 'alert-circle',
      tagText: 'ACTION REQUIRED',
      tagColor: '#92400E',
      tagBg: '#FFFBEB',
      tagBorder: '#FDE68A',
      btnBg: '#FFC700',
      btnText: '#0F172A',
    },
    error: {
      accentColor: '#EF4444',
      ringBg: '#FEF2F2',
      ringBorder: '#FECACA',
      squareBg: '#F87171',
      pipBg: '#DC2626',
      pipIcon: 'close-circle',
      tagText: 'SYSTEM NOTICE',
      tagColor: '#991B1B',
      tagBg: '#FEF2F2',
      tagBorder: '#FECACA',
      btnBg: '#EF4444',
      btnText: '#FFFFFF',
    },
    destructive: {
      accentColor: '#DC2626',
      ringBg: '#FEF2F2',
      ringBorder: '#FCA5A5',
      squareBg: '#EF4444',
      pipBg: '#991B1B',
      pipIcon: 'trash',
      tagText: 'CONFIRM ACTION',
      tagColor: '#991B1B',
      tagBg: '#FEF2F2',
      tagBorder: '#FECACA',
      btnBg: '#DC2626',
      btnText: '#FFFFFF',
    },
    info: {
      accentColor: '#FFC700',
      ringBg: '#FFFBEB',
      ringBorder: '#FEF3C7',
      squareBg: '#FFC700',
      pipBg: '#0F172A',
      pipIcon: 'shield-checkmark',
      tagText: 'CITYONETAXI OFFICIAL',
      tagColor: '#0F172A',
      tagBg: '#FEF3C7',
      tagBorder: '#FDE68A',
      btnBg: '#FFC700',
      btnText: '#0F172A',
    },
  }[type]

  const buttons = alertConfig?.buttons || [{ text: 'Got It' }]
  const isTwoButtons = buttons.length === 2

  return (
    <CorporateAlertContext.Provider value={{ showCorporateAlert: openAlert }}>
      {children}

      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => closeAlert()}
      >
        <View style={styles.backdrop}>
          <Animated.View
            style={[
              styles.card,
              {
                opacity: opacityAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            {/* Top Accent Line */}
            <View style={[styles.topAccent, { backgroundColor: theme.accentColor }]} />

            {/* Corporate 3D Badge Icon */}
            <View style={[styles.iconRing, { backgroundColor: theme.ringBg, borderColor: theme.ringBorder }]}>
              <View style={[styles.iconSquare, { backgroundColor: theme.squareBg }]}>
                {type === 'error' || type === 'destructive' ? (
                  <Ionicons name={type === 'destructive' ? 'trash-outline' : 'alert-circle-outline'} size={32} color="#FFFFFF" />
                ) : (
                  <Image
                    source={require('../../../assets/cityonetaxi_badge.png')}
                    style={styles.logoBadge}
                    resizeMode="contain"
                  />
                )}
              </View>

              {/* Floating Status Pip */}
              <View style={[styles.statusPip, { backgroundColor: theme.pipBg }]}>
                <Ionicons name={theme.pipIcon} size={15} color="#FFFFFF" />
              </View>
            </View>

            {/* Tag Pill */}
            <View style={[styles.tagPill, { backgroundColor: theme.tagBg, borderColor: theme.tagBorder }]}>
              <Ionicons name="shield-checkmark" size={12} color={theme.tagColor} />
              <Text style={[styles.tagText, { color: theme.tagColor }]}>
                {theme.tagText}
              </Text>
            </View>

            {/* Alert Title */}
            <Text style={styles.title}>{alertConfig?.title || 'Notice'}</Text>

            {/* Alert Message */}
            {Boolean(alertConfig?.message) && (
              <Text style={styles.message}>{alertConfig.message}</Text>
            )}

            {/* Security Assurance Tag */}
            <View style={styles.assuranceWrap}>
              <Ionicons name="lock-closed" size={11} color="#64748B" />
              <Text style={styles.assuranceText}>256-Bit SSL Protected • CityOneTaxi</Text>
            </View>

            {/* Action Buttons */}
            {isTwoButtons ? (
              <View style={styles.twoBtnRow}>
                {buttons.map((btn, idx) => {
                  const isDestructive = btn.style === 'destructive'
                  const isCancel = btn.style === 'cancel' || idx === 0 && !isDestructive
                  const isPrimary = !isCancel

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.halfBtn,
                        isCancel && styles.cancelBtn,
                        isPrimary && (isDestructive ? styles.destructiveBtn : styles.primaryBtn),
                      ]}
                      onPress={() => closeAlert(btn.onPress)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.btnTextBase,
                          isCancel && styles.cancelBtnText,
                          isPrimary && (isDestructive ? styles.destructiveBtnText : styles.primaryBtnText),
                        ]}
                      >
                        {sanitizeToEnglish(btn.text) || (isCancel ? 'Cancel' : 'Confirm')}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            ) : (
              <View style={styles.btnStack}>
                {buttons.map((btn, idx) => {
                  const isDestructive = btn.style === 'destructive'
                  const isCancel = btn.style === 'cancel'
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.fullBtn,
                        isCancel ? styles.cancelBtn : (isDestructive ? styles.destructiveBtn : styles.primaryBtn),
                        idx > 0 && { marginTop: 8 },
                      ]}
                      onPress={() => closeAlert(btn.onPress)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.btnTextBase,
                          isCancel ? styles.cancelBtnText : (isDestructive ? styles.destructiveBtnText : styles.primaryBtnText),
                        ]}
                      >
                        {sanitizeToEnglish(btn.text) || 'Continue'}
                      </Text>
                      {!isCancel && (
                        <View style={styles.arrowCircle}>
                          <Ionicons name="arrow-forward" size={14} color={isDestructive ? '#FFFFFF' : '#0F172A'} />
                        </View>
                      )}
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>
    </CorporateAlertContext.Provider>
  )
}

export const useCorporateAlert = () => {
  const ctx = useContext(CorporateAlertContext)
  if (!ctx) {
    return { showCorporateAlert }
  }
  return ctx
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 24,
  },
  topAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  iconRing: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  iconSquare: {
    width: 64,
    height: 64,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  logoBadge: {
    width: 46,
    height: 46,
  },
  statusPip: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  tagText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  message: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  assuranceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 14,
    marginBottom: 18,
  },
  assuranceText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  twoBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  halfBtn: {
    flex: 1,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnStack: {
    width: '100%',
  },
  fullBtn: {
    width: '100%',
    height: 48,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: '#FFC700',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#0F172A',
    fontSize: 14.5,
    fontWeight: '900',
  },
  cancelBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
  destructiveBtn: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  destructiveBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '900',
  },
  btnTextBase: {
    letterSpacing: 0.2,
  },
  arrowCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15, 23, 42, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default CorporateAlertProvider
