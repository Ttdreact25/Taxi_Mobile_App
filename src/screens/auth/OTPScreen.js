import { useState, useRef, useEffect } from 'react'
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
  Modal,
  Animated,
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

  // Professional Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successModalInfo, setSuccessModalInfo] = useState(null)
  const modalScale = useRef(new Animated.Value(0.85)).current
  const modalOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (showSuccessModal) {
      Animated.parallel([
        Animated.spring(modalScale, {
          toValue: 1,
          friction: 6,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      modalScale.setValue(0.85)
      modalOpacity.setValue(0)
    }
  }, [showSuccessModal])

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
        const userObj = res.data.user || {}
        const isDriverRole = isDriver || userObj.role_slug === 'driver' || userObj.role_id === 2

        if (isLogin || isDriverRole) {
          setSuccessModalInfo({
            title: 'Welcome Back!',
            badge: isDriverRole ? 'VERIFIED DRIVER PARTNER' : 'VERIFIED PASSENGER',
            message: isDriverRole
              ? 'Driver login verified successfully via Email OTP.'
              : 'Login verified successfully via Email OTP.',
            buttonText: isDriverRole ? 'Go to Dashboard' : 'Continue to App',
            onProceed: () => {
              setShowSuccessModal(false)
              updateUser(userObj)
            },
          })
          setShowSuccessModal(true)
          return
        }

        setSuccessModalInfo({
          title: 'Account Verified!',
          badge: 'WELCOME TO CITYONETAXI',
          message: res.data?.message || 'Your account has been verified successfully. Welcome aboard!',
          buttonText: 'Sign In Now',
          onProceed: () => {
            setShowSuccessModal(false)
            navigation.navigate('Login')
          },
        })
        setShowSuccessModal(true)
      } else {
        setSuccessModalInfo({
          title: 'Account Verified!',
          badge: 'SECURITY VERIFIED',
          message: res.data?.message || 'Email verified successfully. Please sign in.',
          buttonText: 'Sign In Now',
          onProceed: () => {
            setShowSuccessModal(false)
            navigation.navigate('Login')
          },
        })
        setShowSuccessModal(true)
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

      {/* ── Professional Welcome / Success Alert Modal ── */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (successModalInfo?.onProceed) successModalInfo.onProceed()
        }}
      >
        <View style={styles.modalBackdrop}>
          <Animated.View
            style={[
              styles.modalCard,
              {
                opacity: modalOpacity,
                transform: [{ scale: modalScale }],
              },
            ]}
          >
            {/* Ambient Top Glow Bar */}
            <View style={styles.modalTopAccent} />

            {/* Unique 3D Badge Icon */}
            <View style={styles.modalIconRing}>
              <View style={styles.modalIconSquare}>
                <Image
                  source={require('../../../assets/cityonetaxi_badge.png')}
                  style={styles.modalBadgeImg}
                  resizeMode="contain"
                />
              </View>
              {/* Floating Verified Badge */}
              <View style={styles.modalCheckBadge}>
                <Ionicons name="checkmark-sharp" size={15} color="#FFFFFF" />
              </View>
            </View>

            {/* Tag Pill */}
            <View style={styles.modalTagPill}>
              <Ionicons name="shield-checkmark" size={13} color="#059669" />
              <Text style={styles.modalTagText}>
                {successModalInfo?.badge || 'VERIFIED DRIVER PARTNER'}
              </Text>
            </View>

            {/* Modal Title */}
            <Text style={styles.modalTitle}>{successModalInfo?.title || 'Welcome Back!'}</Text>

            {/* Modal Body Message */}
            <Text style={styles.modalBody}>
              {successModalInfo?.message || 'Driver login verified successfully via Email OTP.'}
            </Text>

            {/* Security Assurance Badge */}
            <View style={styles.modalSecRow}>
              <Ionicons name="lock-closed" size={12} color="#64748B" />
              <Text style={styles.modalSecText}>256-Bit SSL Secured • Active Session</Text>
            </View>

            {/* Primary Action Button */}
            <TouchableOpacity
              style={styles.modalActionBtn}
              onPress={() => {
                if (successModalInfo?.onProceed) {
                  successModalInfo.onProceed()
                }
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.modalActionBtnText}>
                {successModalInfo?.buttonText || 'Go to Dashboard'}
              </Text>
              <View style={styles.modalArrowCircle}>
                <Ionicons name="arrow-forward" size={15} color="#0F172A" />
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
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

  /* ── Professional Welcome Modal Styles ── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingTop: 28,
    paddingBottom: 24,
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
  modalTopAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: '#FFC700',
  },
  modalIconRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFFBEB',
    borderWidth: 2.5,
    borderColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    position: 'relative',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  modalIconSquare: {
    width: 66,
    height: 66,
    borderRadius: 20,
    backgroundColor: '#FFC700',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B45309',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  modalBadgeImg: {
    width: 48,
    height: 48,
  },
  modalCheckBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10B981',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  modalTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  modalTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
    paddingHorizontal: 8,
  },
  modalSecRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 14,
    marginBottom: 18,
  },
  modalSecText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  modalActionBtn: {
    width: '100%',
    backgroundColor: '#FFC700',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modalActionBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  modalArrowCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default OTPScreen
