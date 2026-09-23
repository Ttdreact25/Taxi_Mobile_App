import { useState, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { authAPI } from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const RegisterScreen = ({ navigation }) => {
  const [role, setRole] = useState('customer')
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', license_no: '' })
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [focusedField, setFocusedField] = useState(null)

  const refs = {
    name: useRef(null),
    email: useRef(null),
    phone: useRef(null),
    license_no: useRef(null),
    password: useRef(null),
  }

  const field = (key, val) => setForm(p => ({ ...p, [key]: val }))

  const handleRegister = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.password) {
      Alert.alert('Required Fields', 'Please fill in all required fields to register.')
      return
    }
    if (role === 'driver' && !form.license_no.trim()) {
      Alert.alert('License Required', 'Please enter your Commercial Driving License Number (e.g. TN-01-2024-1234567).')
      return
    }
    if (form.password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters long.')
      return
    }
    setLoading(true)
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        role: role,
        license_no: role === 'driver' ? form.license_no.trim() : undefined,
      }
      const res = await authAPI.register(payload)
      if (res.data?.status === 'success') {
        if (role === 'driver') {
          Alert.alert(
            'Driver Registration Submitted 🚖',
            'Your Driver Partner registration has been received.\n\nOur Admin team will review and accept your registration. Once accepted, you can sign in to complete your KYC document verification and start taking taxi rides.',
            [{ text: 'Proceed to Sign In', onPress: () => navigation.navigate('Login') }]
          )
        } else {
          const otpCodeMsg = res.data?.otp ? ` (OTP Code: ${res.data.otp})` : ''
          Alert.alert(
            'Verification Code Sent 📩',
            `An OTP code has been sent to your email: ${form.email}${otpCodeMsg}`,
            [{ text: 'Proceed to Verify', onPress: () => navigation.navigate('OTP', { email: form.email, phone: form.phone }) }]
          )
        }
      } else {
        Alert.alert('Registration Failed', res.data?.message || 'Could not register. Please try again.')
      }
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Network request failed. Please check connection.'
      Alert.alert('Error', msg)
    } finally {
      setLoading(false)
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
              <Ionicons name="arrow-back" size={20} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>Create Account</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Header Title */}
          <View style={styles.header}>
            <Text style={styles.brandTitle}>Join CityDropTaxi</Text>
            <Text style={styles.subtitle}>
              {role === 'driver'
                ? 'Sign up as a driver partner to accept taxi rides & earn'
                : 'Sign up to book instant city cabs & outstation trips'}
            </Text>
          </View>

          {/* Role Selection Tabs */}
          <View style={styles.roleTabsContainer}>
            <TouchableOpacity
              onPress={() => setRole('customer')}
              style={[styles.roleTab, role === 'customer' && styles.roleTabActive]}
              activeOpacity={0.85}
            >
              <Ionicons
                name="person"
                size={16}
                color={role === 'customer' ? COLORS.white : COLORS.gray400}
              />
              <Text style={[styles.roleTabText, role === 'customer' && styles.roleTabTextActive]}>
                Passenger
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setRole('driver')}
              style={[styles.roleTab, role === 'driver' && styles.roleTabActive]}
              activeOpacity={0.85}
            >
              <Ionicons
                name="car-sport"
                size={17}
                color={role === 'driver' ? COLORS.white : COLORS.gray400}
              />
              <Text style={[styles.roleTabText, role === 'driver' && styles.roleTabTextActive]}>
                Driver Partner
              </Text>
            </TouchableOpacity>
          </View>

          {/* Registration Card */}
          <View style={styles.card}>
            {[
              { key: 'name', nextKey: 'email', label: 'FULL NAME', icon: 'person-outline', type: 'default', caps: 'words', placeholder: 'Enter your full name' },
              { key: 'email', nextKey: 'phone', label: 'EMAIL ADDRESS', icon: 'mail-outline', type: 'email-address', caps: 'none', placeholder: 'name@example.com' },
              { key: 'phone', nextKey: role === 'driver' ? 'license_no' : 'password', label: 'MOBILE PHONE', icon: 'call-outline', type: 'phone-pad', caps: 'none', placeholder: '10-digit mobile number' },
              ...(role === 'driver' ? [
                { key: 'license_no', nextKey: 'password', label: 'DRIVING LICENSE NO', icon: 'card-outline', type: 'default', caps: 'characters', placeholder: 'e.g. TN-01-2024-1234567' }
              ] : [])
            ].map(f => (
              <View key={f.key} style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{f.label}</Text>
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => refs[f.key].current?.focus()}
                  style={[styles.inputWrap, focusedField === f.key && styles.inputWrapFocused]}
                >
                  <Ionicons
                    name={f.icon}
                    size={19}
                    color={focusedField === f.key ? COLORS.primary : COLORS.gray400}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    ref={refs[f.key]}
                    style={styles.input}
                    placeholder={f.placeholder}
                    placeholderTextColor={COLORS.gray400}
                    value={form[f.key]}
                    onChangeText={t => field(f.key, t)}
                    onFocus={() => setFocusedField(f.key)}
                    onBlur={() => setFocusedField(null)}
                    keyboardType={f.type}
                    autoCapitalize={f.caps}
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => refs[f.nextKey].current?.focus()}
                    underlineColorAndroid="transparent"
                  />
                </TouchableOpacity>
              </View>
            ))}

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>SET PASSWORD</Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => refs.password.current?.focus()}
                style={[styles.inputWrap, focusedField === 'password' && styles.inputWrapFocused]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color={focusedField === 'password' ? COLORS.primary : COLORS.gray400}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={refs.password}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="At least 6 characters"
                  placeholderTextColor={COLORS.gray400}
                  value={form.password}
                  onChangeText={t => field('password', t)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showPw}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                  underlineColorAndroid="transparent"
                />
                <TouchableOpacity onPress={() => setShowPw(p => !p)} style={styles.eyeBtn}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={19} color={COLORS.gray400} />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {/* Create Account Button */}
            <TouchableOpacity
              style={[
                styles.btn,
                (!form.name || !form.email || !form.phone || !form.password || (role === 'driver' && !form.license_no)) && styles.btnDisabled
              ]}
              onPress={handleRegister}
              disabled={loading || !form.name || !form.email || !form.phone || !form.password || (role === 'driver' && !form.license_no)}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <View style={styles.btnRow}>
                  <Text style={styles.btnText}>
                    {role === 'driver' ? 'Register as Driver Partner' : 'Register & Get Started'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
                </View>
              )}
            </TouchableOpacity>

            {/* Terms and Privacy Policy Consent */}
            <View style={styles.legalNotice}>
              <Text style={styles.legalNoticeText}>By registering, you agree to CityDropTaxi's </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Terms')} activeOpacity={0.7}>
                <Text style={styles.legalNoticeLink}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={styles.legalNoticeText}> and </Text>
              <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')} activeOpacity={0.7}>
                <Text style={styles.legalNoticeLink}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>

            {/* Existing User Link */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} activeOpacity={0.8}>
                <Text style={styles.linkText}>Sign In</Text>
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
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
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

  roleTabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: RADIUS.lg,
    padding: 4,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    gap: 6,
  },
  roleTabActive: {
    backgroundColor: COLORS.primary,
    ...SHADOW.sm,
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gray400,
  },
  roleTabTextActive: {
    color: COLORS.white,
  },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xxl,
    padding: SPACING.xl,
    ...SHADOW.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    height: 52,
  },
  inputWrapFocused: {
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
    ...SHADOW.xs,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  eyeBtn: {
    padding: 6,
  },

  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
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
  legalNotice: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: 8,
  },
  legalNoticeText: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    lineHeight: 18,
    textAlign: 'center',
  },
  legalNoticeLink: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.primary,
    textDecorationLine: 'underline',
    lineHeight: 18,
  },
})

export default RegisterScreen
