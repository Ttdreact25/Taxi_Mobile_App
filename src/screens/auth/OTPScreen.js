import { useState, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { authAPI, tokenManager } from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const OTPScreen = ({ route, navigation }) => {
  const { email, phone } = route.params || {}
  const identifier = email || phone || ''
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()]

  const handleChange = (val, idx) => {
    const newOtp = [...otp]
    newOtp[idx] = val
    setOtp(newOtp)
    if (val && idx < 5) {
      refs[idx + 1].current?.focus()
      setFocusedIndex(idx + 1)
    }
  }

  const handleKey = (e, idx) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      refs[idx - 1].current?.focus()
      setFocusedIndex(idx - 1)
    }
  }

  const handleVerify = async () => {
    const code = otp.join('')
    if (code.length < 6) {
      Alert.alert('Incomplete Code', 'Please enter the complete 6-digit OTP verification code.')
      return
    }
    setLoading(true)
    try {
      const res = await authAPI.verifyOTP({ email: identifier, phone: identifier, otp: code })
      if (res.data?.pending_approval || res.data?.status === 'pending_approval') {
        Alert.alert(
          'Verification Successful ⏳',
          res.data?.message || 'Your Driver Partner account registration is awaiting Admin acceptance. Once accepted, you can sign in to complete KYC documents.',
          [{ text: 'Go to Login', onPress: () => navigation.navigate('Login') }]
        )
        return
      }

      if (res.data?.status === 'success') {
        if (res.data.token) {
          await tokenManager.save(res.data.token)
        }
        Alert.alert('Verification Successful 🎉', 'Your account has been verified. Welcome to CityDropTaxi!', [
          { text: 'Go to Login', onPress: () => navigation.navigate('Login') }
        ])
      } else {
        Alert.alert('Verification Failed', res.data?.message || 'Invalid OTP code. Please try again.')
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      const res = await authAPI.resendOTP({ email: identifier, phone: identifier })
      if (res.data?.status === 'success') {
        Alert.alert('OTP Resent 📩', `A fresh 6-digit verification code has been sent to ${identifier}`)
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to resend OTP')
      }
    } catch {
      Alert.alert('Error', 'Failed to resend verification OTP.')
    } finally {
      setResending(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Top Bar with Back Button */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={20} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>Verification</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Header Icon & Text */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail-open-outline" size={36} color={COLORS.white} />
            </View>
            <Text style={styles.brandTitle}>Verify Your Email</Text>
            <Text style={styles.subtitle}>Enter the 6-digit verification code sent to</Text>
            <View style={styles.targetPill}>
              <Ionicons name="mail" size={13} color={COLORS.primary} />
              <Text style={styles.emailText}>{identifier}</Text>
            </View>
          </View>

          {/* OTP Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Enter 6-Digit PIN</Text>
            
            {/* 6 OTP Boxes */}
            <View style={styles.otpRow}>
              {otp.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={refs[i]}
                  style={[
                    styles.otpBox,
                    focusedIndex === i && styles.otpBoxFocused,
                    digit ? styles.otpBoxFilled : null,
                  ]}
                  maxLength={1}
                  keyboardType="number-pad"
                  value={digit}
                  onChangeText={val => handleChange(val, i)}
                  onFocus={() => setFocusedIndex(i)}
                  onKeyPress={e => handleKey(e, i)}
                  textAlign="center"
                />
              ))}
            </View>

            {/* Verify CTA Button */}
            <TouchableOpacity
              style={[styles.btn, otp.join('').length < 6 && styles.btnDisabled]}
              onPress={handleVerify}
              disabled={loading || otp.join('').length < 6}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <View style={styles.btnRow}>
                  <Text style={styles.btnText}>Verify & Continue</Text>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                </View>
              )}
            </TouchableOpacity>

            {/* Resend Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Didn't receive the email code? </Text>
              <TouchableOpacity onPress={handleResend} disabled={resending} activeOpacity={0.8}>
                <Text style={styles.linkText}>{resending ? 'Sending Code...' : 'Resend OTP'}</Text>
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxxl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.white,
  },
  header: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    ...SHADOW.glow,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  targetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  emailText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.white,
  },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xxl,
    padding: SPACING.xl,
    ...SHADOW.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginTop: SPACING.sm,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.lg,
  },

  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xl,
    gap: 8,
  },
  otpBox: {
    flex: 1,
    height: 54,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.textPrimary,
    backgroundColor: '#F8FAFC',
  },
  otpBoxFocused: {
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
    ...SHADOW.xs,
  },
  otpBoxFilled: {
    borderColor: COLORS.primary,
    backgroundColor: '#EEF2FF',
  },

  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.md,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  footerText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: '900',
    fontSize: 13,
  },
})

export default OTPScreen
