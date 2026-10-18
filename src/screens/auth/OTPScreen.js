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
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { authAPI, tokenManager } from '../../api/api'
import { useAuth } from '../../context/AuthContext'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const OTPScreen = ({ route, navigation }) => {
  const { updateUser } = useAuth()
  const { email, phone, identifier: paramId, role, isLogin } = route.params || {}
  const targetEmail = email || (paramId && paramId.includes('@') ? paramId : '')
  const identifier = targetEmail || email || phone || paramId || ''
  const isDriver = role === 'driver' || Boolean(targetEmail)

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

      if (res.data?.token) {
        await tokenManager.save(res.data.token)
        if (res.data?.user) {
          updateUser(res.data.user)
        }
        if (isLogin || isDriver) {
          Alert.alert('Welcome Back! 🚗', 'Driver login verified successfully via Email OTP.')
          return
        }
        Alert.alert('Verified! 🎉', 'Welcome to CityOneTaxi! Your account is now verified.', [
          { text: 'Get Started', onPress: () => navigation.navigate('Login') }
        ])
      } else {
        Alert.alert('Verified! 🎉', res.data?.message || 'Email verified successfully. Please sign in.', [
          { text: 'Sign In Now', onPress: () => navigation.navigate('Login') }
        ])
      }
    } catch (err) {
      Alert.alert('Invalid Code', err.response?.data?.message || err.message || 'Incorrect verification code. Please check your email and retry.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await authAPI.resendOTP({ email: identifier, phone: identifier })
      Alert.alert('Code Resent 📧', `A fresh 6-digit verification code has been dispatched exclusively to ${targetEmail || identifier}. No SMS is sent to phone number.`)
    } catch (err) {
      Alert.alert('Resend Failed', err.response?.data?.message || err.message || 'Unable to resend OTP at this time.')
    } finally {
      setResending(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Bar with Back Button */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={20} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>Security Verification</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Header Icon & Title */}
          <View style={styles.header}>
            <Image
              source={require('../../../assets/cityonetaxi_badge.png')}
              style={{ width: 72, height: 72, marginBottom: 12, alignSelf: 'center' }}
              resizeMode="contain"
            />
            <Text style={styles.brandTitle}>Enter 6-Digit Email OTP</Text>
            <Text style={styles.subtitle}>
              We have dispatched a verification code strictly to your registered email:
            </Text>
            <View style={styles.targetPill}>
              <Ionicons name="mail" size={13} color={COLORS.primary} />
              <Text style={styles.targetText}>{targetEmail || identifier || 'Your Registered Email'}</Text>
            </View>
            <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '700', marginTop: 8, letterSpacing: 0.2 }}>
              🔒 Email OTP Only · No SMS sent to phone number
            </Text>
          </View>

          {/* Luxury Card Container */}
          <View style={styles.card}>
            {/* 6 Digit Input Boxes */}
            <View style={styles.otpRow}>
              {otp.map((digit, idx) => (
                <TextInput
                  key={idx}
                  ref={refs[idx]}
                  style={[
                    styles.otpBox,
                    Boolean(digit) && styles.otpBoxFilled,
                    focusedIndex === idx && styles.otpBoxFocused,
                  ]}
                  value={digit}
                  onChangeText={v => handleChange(v, idx)}
                  onKeyPress={e => handleKey(e, idx)}
                  onFocus={() => setFocusedIndex(idx)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  textAlign="center"
                  underlineColorAndroid="transparent"
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
                  <Text style={styles.btnText}>Verify & Proceed</Text>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                </View>
              )}
            </TouchableOpacity>

            {/* Resend Link & Actions */}
            <View style={styles.resendWrap}>
              <Text style={styles.resendText}>Didn't receive the OTP? </Text>
              <TouchableOpacity
                onPress={handleResend}
                disabled={resending}
                activeOpacity={0.7}
              >
                {resending ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Text style={styles.resendLink}>Resend Code</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.changeWrap}>
              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <Text style={styles.changeLink}>Edit phone number or email</Text>
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
    backgroundColor: COLORS.background,
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
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  header: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    ...SHADOW.glow,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  targetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  targetText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xxl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    ...SHADOW.md,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: SPACING.xl,
  },
  otpBox: {
    width: 46,
    height: 54,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.gray50,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  otpBoxFilled: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.primaryMid,
  },
  otpBoxFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  btn: {
    height: 52,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.sm,
  },
  btnDisabled: {
    opacity: 0.55,
    elevation: 0,
    shadowOpacity: 0,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.base,
    fontWeight: '800',
  },
  resendWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  resendText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  resendLink: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  changeWrap: {
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  changeLink: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
})

export default OTPScreen
