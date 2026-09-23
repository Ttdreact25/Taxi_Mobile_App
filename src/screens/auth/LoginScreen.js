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
import { useAuth } from '../../context/AuthContext'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const LoginScreen = ({ navigation }) => {
  const { login } = useAuth()
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [focusedField, setFocusedField] = useState(null)

  const identifierRef = useRef(null)
  const passwordRef = useRef(null)

  const handleLogin = async () => {
    if (!form.identifier.trim() || !form.password) {
      Alert.alert('Required Fields', 'Please enter your registered mobile number or email and password.')
      return
    }
    setLoading(true)
    try {
      await login(form.identifier.trim(), form.password)
    } catch (err) {
      Alert.alert('Login Failed', err.message || 'Invalid credentials. Please verify and try again.')
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
          {/* Top Brand Header */}
          <View style={styles.header}>
            <View style={styles.logoWrap}>
              <View style={styles.logoCircle}>
                <Ionicons name="car" size={32} color={COLORS.white} />
              </View>
              <View style={styles.verifiedDot}>
                <Ionicons name="checkmark" size={10} color={COLORS.white} />
              </View>
            </View>

            <Text style={styles.brandTitle}>CityDropTaxi</Text>
            <View style={styles.taglineBadge}>
              <Ionicons name="shield-checkmark" size={12} color={COLORS.success} />
              <Text style={styles.taglineText}>Fast, Safe & Verified Rides</Text>
            </View>
          </View>

          {/* Luxury Login Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Welcome Back</Text>
              <Text style={styles.cardSub}>Sign in to book cabs or manage driver trips</Text>
            </View>

            {/* Mobile / Email Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>MOBILE OR EMAIL</Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => identifierRef.current?.focus()}
                style={[styles.inputWrap, focusedField === 'identifier' && styles.inputWrapFocused]}
              >
                <Ionicons
                  name="person-outline"
                  size={19}
                  color={focusedField === 'identifier' ? COLORS.primary : COLORS.gray400}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={identifierRef}
                  style={styles.input}
                  placeholder="Enter phone or email"
                  placeholderTextColor={COLORS.gray400}
                  value={form.identifier}
                  onChangeText={t => setForm(p => ({ ...p, identifier: t }))}
                  onFocus={() => setFocusedField('identifier')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  underlineColorAndroid="transparent"
                />
                {Boolean(form.identifier) && (
                  <TouchableOpacity onPress={() => setForm(p => ({ ...p, identifier: '' }))} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={18} color={COLORS.gray400} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.inputLabel}>PASSWORD</Text>
                <TouchableOpacity onPress={() => Alert.alert('Password Help', 'Please contact support or register a new account if you forgot your password.')}>
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                activeOpacity={1}
                onPress={() => passwordRef.current?.focus()}
                style={[styles.inputWrap, focusedField === 'password' && styles.inputWrapFocused]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color={focusedField === 'password' ? COLORS.primary : COLORS.gray400}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={COLORS.gray400}
                  value={form.password}
                  onChangeText={t => setForm(p => ({ ...p, password: t }))}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showPw}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  underlineColorAndroid="transparent"
                />
                <TouchableOpacity onPress={() => setShowPw(p => !p)} style={styles.eyeBtn}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={19} color={COLORS.gray400} />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {/* Sign In Primary CTA Button */}
            <TouchableOpacity
              style={[styles.btn, (!form.identifier || !form.password) && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading || !form.identifier || !form.password}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <View style={styles.btnRow}>
                  <Text style={styles.btnText}>Sign In to CityDropTaxi</Text>
                  <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
                </View>
              )}
            </TouchableOpacity>

            {/* Register Link Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>New to CityDropTaxi? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.8}>
                <Text style={styles.linkText}>Create Account</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Security & Safety Note */}
          <View style={styles.safetyFooter}>
            <Ionicons name="lock-closed" size={13} color="#94A3B8" />
            <Text style={styles.safetyText}>256-Bit SSL Encrypted • Real-time GPS Fleet Tracking</Text>
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
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  logoWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.glow,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  verifiedDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  taglineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E2E8F0',
  },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xxl,
    padding: SPACING.xl,
    ...SHADOW.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  cardHeader: {
    marginBottom: SPACING.lg,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  cardSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: '500',
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
  forgotText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
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

  safetyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.lg,
  },
  safetyText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
})

export default LoginScreen
