import { useState, useRef, useEffect } from 'react'
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
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { authAPI, citiesAPI } from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const RegisterScreen = ({ navigation }) => {
  const [role, setRole] = useState('customer')
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', license_no: '', city_id: null })
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [focusedField, setFocusedField] = useState(null)
  const [cities, setCities] = useState([])
  const [selectedCity, setSelectedCity] = useState(null)
  const [selectedServices, setSelectedServices] = useState(['local', 'outstation', 'hourly'])

  const toggleService = (key) => {
    setSelectedServices(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) {
          Alert.alert('Required Selection', 'You must select at least one service category you operate.')
          return prev
        }
        return prev.filter(s => s !== key)
      } else {
        return [...prev, key]
      }
    })
  }

  const refs = {
    name: useRef(null),
    email: useRef(null),
    phone: useRef(null),
    license_no: useRef(null),
    password: useRef(null),
  }

  const field = (key, val) => setForm(p => ({ ...p, [key]: val }))

  useEffect(() => {
    citiesAPI.list({ status: 'active' }).then(res => {
      if (res.data?.status === 'success' || Array.isArray(res.data?.cities)) {
        const list = res.data.cities || []
        setCities(list)
        if (list.length > 0) {
          setForm(p => ({ ...p, city_id: p.city_id || list[0].id }))
          setSelectedCity(list[0])
        }
      }
    }).catch(() => {})
  }, [])

  const handleRegister = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.password) {
      Alert.alert('Required Fields', 'Please fill in all required fields to register.')
      return
    }
    if (role === 'driver' && !form.license_no.trim()) {
      Alert.alert('License Required', 'Please enter your Commercial Driving License Number (e.g. TN-01-2024-1234567).')
      return
    }
    if (role === 'driver' && !form.city_id) {
      Alert.alert('Operating City Required', 'Please select your operating city / territory.')
      return
    }
    if (role === 'driver' && selectedServices.length === 0) {
      Alert.alert('Service Category Required', 'Please select at least one service type you operate (Local drop, Out station, or Hourly package).')
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
        city_id: role === 'driver' ? form.city_id : undefined,
        service_types: role === 'driver' ? selectedServices.join(',') : undefined,
      }
      const res = await authAPI.register(payload)
      if (res.data?.status === 'success') {
        const destEmail = res.data.email || form.email.trim()
        Alert.alert(
          'Email Verification Code Sent 📧',
          `An OTP code has been dispatched to your email:\n\n${destEmail}\n\nPlease check your email inbox to complete registration.\n\n🔒 No SMS sent to phone number.`,
          [
            {
              text: 'Enter Email OTP',
              onPress: () => navigation.navigate('OTP', {
                email: destEmail,
                phone: form.phone.trim(),
                identifier: destEmail,
                role,
                isLogin: false,
              }),
            },
          ]
        )
      } else {
        Alert.alert('Registration Failed', res.data?.message || 'Unable to complete registration. Please try again.')
      }
    } catch (err) {
      Alert.alert('Registration Failed', err.response?.data?.message || err.message || 'Could not connect to server.')
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
              <Ionicons name="arrow-back" size={20} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>Create Account</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Header Brand */}
          <View style={styles.header}>
            <Text style={styles.brandTitle}>
              Join CityOne<Text style={{ color: COLORS.secondary }}>Taxi</Text>
            </Text>
            <Text style={styles.subtitle}>Fastest booking across Tamil Nadu</Text>
          </View>

          {/* Account Role Segmented Toggle (Material 3 Style) */}
          <View style={styles.roleTabsContainer}>
            <TouchableOpacity
              style={[styles.roleTab, role === 'customer' && styles.roleTabActive]}
              onPress={() => setRole('customer')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="person"
                size={16}
                color={role === 'customer' ? COLORS.primary : COLORS.gray500}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.roleTabText, role === 'customer' && styles.roleTabTextActive]}>
                Passenger / Rider
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleTab, role === 'driver' && styles.roleTabActive]}
              onPress={() => setRole('driver')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="car-sport"
                size={16}
                color={role === 'driver' ? COLORS.primary : COLORS.gray500}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.roleTabText, role === 'driver' && styles.roleTabTextActive]}>
                Driver Partner
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {/* Full Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>FULL NAME</Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => refs.name.current?.focus()}
                style={[styles.inputWrap, focusedField === 'name' && styles.inputWrapFocused]}
              >
                <Ionicons
                  name="person-outline"
                  size={19}
                  color={focusedField === 'name' ? COLORS.primary : COLORS.gray400}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={refs.name}
                  style={styles.input}
                  placeholder="Enter your full name"
                  placeholderTextColor={COLORS.gray400}
                  value={form.name}
                  onChangeText={v => field('name', v)}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  returnKeyType="next"
                  onSubmitEditing={() => refs.phone.current?.focus()}
                  underlineColorAndroid="transparent"
                />
              </TouchableOpacity>
            </View>

            {/* Mobile Number */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>MOBILE NUMBER</Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => refs.phone.current?.focus()}
                style={[styles.inputWrap, focusedField === 'phone' && styles.inputWrapFocused]}
              >
                <Ionicons
                  name="call-outline"
                  size={19}
                  color={focusedField === 'phone' ? COLORS.primary : COLORS.gray400}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={refs.phone}
                  style={styles.input}
                  placeholder="Enter 10-digit mobile number"
                  placeholderTextColor={COLORS.gray400}
                  value={form.phone}
                  onChangeText={v => field('phone', v)}
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => refs.email.current?.focus()}
                  underlineColorAndroid="transparent"
                />
              </TouchableOpacity>
            </View>

            {/* Email Address */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => refs.email.current?.focus()}
                style={[styles.inputWrap, focusedField === 'email' && styles.inputWrapFocused]}
              >
                <Ionicons
                  name="mail-outline"
                  size={19}
                  color={focusedField === 'email' ? COLORS.primary : COLORS.gray400}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={refs.email}
                  style={styles.input}
                  placeholder="Enter email address"
                  placeholderTextColor={COLORS.gray400}
                  value={form.email}
                  onChangeText={v => field('email', v)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => role === 'driver' ? refs.license_no.current?.focus() : refs.password.current?.focus()}
                  underlineColorAndroid="transparent"
                />
              </TouchableOpacity>
            </View>

            {/* Driver License & Operating City (Driver only) */}
            {role === 'driver' && (
              <>
                {/* Operating City Selector with Live City Icon Display */}
                <View style={styles.inputGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={styles.inputLabel}>OPERATIONAL CITY / LOCATION</Text>
                    <Text style={styles.badgeLabel}>REQUIRED</Text>
                  </View>

                  {/* Highlighted Chosen Location Banner with City Image */}
                  <View style={styles.citySelectedCard}>
                    <View style={styles.citySelectedIconBox}>
                      {selectedCity && (selectedCity.icon_url || (selectedCity.icon && (selectedCity.icon.startsWith('http') || selectedCity.icon.startsWith('/uploads') || selectedCity.icon.startsWith('cities/')))) ? (
                        <Image source={{ uri: selectedCity.icon_url || selectedCity.icon }} style={{ width: 28, height: 28, borderRadius: 6 }} resizeMode="cover" />
                      ) : (
                        <Ionicons name="business-outline" size={22} color="#6366F1" />
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.citySelectedName}>{selectedCity ? selectedCity.name : 'Select Operating City'}</Text>
                      <Text style={styles.citySelectedState}>
                        {selectedCity ? `${selectedCity.state || 'Tamil Nadu'} • Active Hub` : 'Tap a city below'}
                      </Text>
                    </View>
                    {selectedCity && (
                      <View style={styles.citySelectedCheck}>
                        <Ionicons name="checkmark-circle" size={20} color={COLORS.success || '#10B981'} />
                      </View>
                    )}
                  </View>

                  {/* Horizontal City Chips */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingVertical: 6 }}
                  >
                    {cities.map(c => {
                      const isSel = (form.city_id === c.id) || (selectedCity?.id === c.id)
                      const hasImg = Boolean(c.icon_url || (c.icon && (c.icon.startsWith('http') || c.icon.startsWith('/uploads') || c.icon.startsWith('cities/'))))
                      return (
                        <TouchableOpacity
                          key={c.id}
                          activeOpacity={0.8}
                          onPress={() => {
                            field('city_id', c.id)
                            setSelectedCity(c)
                          }}
                          style={[styles.cityChip, isSel && styles.cityChipActive]}
                        >
                          {hasImg ? (
                            <Image source={{ uri: c.icon_url || c.icon }} style={{ width: 16, height: 16, borderRadius: 4, marginRight: 6 }} />
                          ) : (
                            <Ionicons name="location-outline" size={14} color={isSel ? '#4F46E5' : '#64748B'} style={{ marginRight: 4 }} />
                          )}
                          <Text style={[styles.cityChipText, isSel && styles.cityChipTextActive]}>{c.name}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                </View>

                {/* Driving License Input */}
                <View style={styles.inputGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.inputLabel}>DRIVING LICENSE NUMBER</Text>
                    <Text style={styles.badgeLabel}>COMMERCIAL</Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => refs.license_no.current?.focus()}
                    style={[styles.inputWrap, focusedField === 'license_no' && styles.inputWrapFocused]}
                  >
                    <Ionicons
                      name="id-card-outline"
                      size={19}
                      color={focusedField === 'license_no' ? COLORS.primary : COLORS.gray400}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      ref={refs.license_no}
                      style={styles.input}
                      placeholder="e.g. TN-01-2024-1234567"
                      placeholderTextColor={COLORS.gray400}
                      value={form.license_no}
                      onChangeText={v => field('license_no', v.toUpperCase())}
                      onFocus={() => setFocusedField('license_no')}
                      onBlur={() => setFocusedField(null)}
                      autoCapitalize="characters"
                      returnKeyType="next"
                      onSubmitEditing={() => refs.password.current?.focus()}
                      underlineColorAndroid="transparent"
                    />
                  </TouchableOpacity>
                </View>

                {/* Operating Service Categories (Driver only) */}
                <View style={styles.inputGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={styles.inputLabel}>OPERATING SERVICE TYPES</Text>
                    <View style={styles.serviceCountBadge}>
                      <Text style={styles.serviceCountBadgeText}>{selectedServices.length}/3 ACTIVE</Text>
                    </View>
                  </View>
                  <Text style={styles.serviceHintText}>
                    Choose trip types you accept. Trips will be auto-assigned & manually dispatched strictly to matching drivers.
                  </Text>

                  <View style={styles.serviceListWrapper}>
                    {[
                      {
                        key: 'local',
                        title: 'Local Drop',
                        subtitle: 'Point-to-point one-way city rides',
                        icon: 'car-outline',
                        badge: 'City Taxi',
                        color: '#4F46E5',
                        bgLight: '#EEF2FF',
                      },
                      {
                        key: 'outstation',
                        title: 'Out Station',
                        subtitle: 'Inter-city round trips & one-way drops',
                        icon: 'navigate-outline',
                        badge: 'Long Trip',
                        color: '#059669',
                        bgLight: '#ECFDF5',
                      },
                      {
                        key: 'hourly',
                        title: 'Hourly Package',
                        subtitle: 'Rentals by the hour (1h, 2h, 4h, 8h...)',
                        icon: 'time-outline',
                        badge: 'Rental',
                        color: '#D97706',
                        bgLight: '#FFFBEB',
                      },
                    ].map(svc => {
                      const isSelected = selectedServices.includes(svc.key)
                      return (
                        <TouchableOpacity
                          key={svc.key}
                          activeOpacity={0.82}
                          onPress={() => toggleService(svc.key)}
                          style={[
                            styles.serviceCard,
                            isSelected && { borderColor: svc.color, backgroundColor: svc.bgLight }
                          ]}
                        >
                          <View style={[styles.serviceIconBox, { backgroundColor: isSelected ? svc.color : '#F1F5F9' }]}>
                            <Ionicons name={svc.icon} size={20} color={isSelected ? '#FFFFFF' : '#64748B'} />
                          </View>
                          <View style={{ flex: 1, marginHorizontal: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.serviceCardTitle, isSelected && { color: '#0F172A' }]}>
                                {svc.title}
                              </Text>
                              <View style={[styles.serviceTypeBadge, { backgroundColor: isSelected ? '#FFFFFF' : '#E2E8F0' }]}>
                                <Text style={[styles.serviceTypeBadgeText, { color: isSelected ? svc.color : '#64748B' }]}>
                                  {svc.badge}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.serviceCardSubtitle} numberOfLines={2}>
                              {svc.subtitle}
                            </Text>
                          </View>
                          <View style={[styles.checkboxBox, isSelected && { backgroundColor: svc.color, borderColor: svc.color }]}>
                            {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                          </View>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              </>
            )}

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CREATE PASSWORD</Text>
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
                  style={styles.input}
                  placeholder="At least 6 characters"
                  placeholderTextColor={COLORS.gray400}
                  value={form.password}
                  onChangeText={v => field('password', v)}
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

            {/* Submit Button */}
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
              <Text style={styles.legalNoticeText}>By registering, you agree to CityOneTaxi's </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Terms')} activeOpacity={0.7}>
                <Text style={styles.legalNoticeLink}>Terms</Text>
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
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
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
  roleTabsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.gray100,
    borderRadius: RADIUS.xl,
    padding: 4,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
  },
  roleTabActive: {
    backgroundColor: COLORS.white,
    ...SHADOW.xs,
  },
  roleTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  roleTabTextActive: {
    color: COLORS.primary,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xxl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    ...SHADOW.md,
  },
  inputGroup: {
    marginBottom: SPACING.md + 2,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    paddingHorizontal: SPACING.md,
    height: 52,
  },
  inputWrapFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
    height: '100%',
  },
  eyeBtn: {
    padding: 6,
  },
  btn: {
    height: 52,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
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
  legalNotice: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: 8,
  },
  legalNoticeText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  legalNoticeLink: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  footerText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  citySelectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.lg,
    padding: 10,
    marginBottom: 4,
  },
  citySelectedIconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  citySelectedName: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  citySelectedState: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  citySelectedCheck: {
    paddingRight: 4,
  },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.full || 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 6,
  },
  cityChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  cityChipIcon: {
    fontSize: 14,
  },
  cityChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  cityChipTextActive: {
    color: COLORS.white,
  },
  serviceCountBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full || 99,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  serviceCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 0.5,
  },
  serviceHintText: {
    fontSize: 11,
    color: COLORS.textSecondary || '#64748B',
    marginBottom: 10,
    lineHeight: 16,
  },
  serviceListWrapper: {
    gap: 10,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  serviceIconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  serviceTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  serviceTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  serviceCardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default RegisterScreen
