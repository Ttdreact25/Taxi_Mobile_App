import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supportAPI } from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import EmptyState from '../../components/common/EmptyState'

const FAQS = [
  {
    q: 'How do I cancel my ride?',
    a: 'You can cancel anytime from the Live Booking Track screen. Please cancel within 3 minutes of driver assignment to avoid standard cancellation fees.',
  },
  {
    q: 'How does fare calculation work?',
    a: 'Fares are calculated based on base fare, per-kilometer rate, estimated travel time, and tolls. The fare shown at booking is guaranteed.',
  },
  {
    q: 'What is 50/50 Shared Long Trip?',
    a: 'Shared trips allow two verified passengers travelling on identical outstation routes (≥130 km) to split the vehicle cost equally, saving 50% on travel expenses.',
  },
  {
    q: 'Is live GPS fleet tracking available?',
    a: 'Yes, every CityOneTaxi trip is monitored live 24/7 with emergency SOS features linked to the central control room.',
  },
]

const SupportScreen = ({ navigation }) => {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('medium')
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState(null)

  useEffect(() => {
    supportAPI.myTickets().then(r => setTickets(r.data?.tickets || [])).catch(() => {})
  }, [])

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Required Fields', 'Please enter a ticket subject and description of your issue.')
      return
    }
    setLoading(true)
    try {
      const res = await supportAPI.create({ subject: subject.trim(), message: message.trim(), priority })
      if (res.data?.status === 'success') {
        Alert.alert('Ticket Submitted! 🎉', 'Our 24x7 support team has received your request and will contact you shortly.')
        setSubject('')
        setMessage('')
        const r = await supportAPI.myTickets()
        setTickets(r.data?.tickets || [])
      } else {
        Alert.alert('Submission Error', res.data?.message || 'Could not submit support ticket.')
      }
    } catch {
      Alert.alert('Network Error', 'Submission failed. Please check internet connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleCall = () => {
    Linking.openURL('tel:1800123456').catch(() => Alert.alert('Error', 'Unable to initiate call'))
  }

  const handleWhatsApp = () => {
    Linking.openURL('https://wa.me/919876543210?text=Hello%20CityOneTaxi%20Support').catch(() => Alert.alert('Error', 'Unable to open WhatsApp'))
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Official Brand Support Banner */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          backgroundColor: '#FFFFFF',
          padding: 16,
          borderRadius: 18,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E2E8F0',
          elevation: 2,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
        }}>
          <Image
            source={require('../../../assets/cityonetaxi_badge.png')}
            style={{ width: 48, height: 48 }}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>CityOneTaxi 24/7 Desk</Text>
            <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Official Customer Assistance & Live SOS</Text>
          </View>
        </View>

        {/* Quick Contact Hero Row */}
        <View style={styles.quickContactRow}>
          <TouchableOpacity style={styles.quickCard} onPress={handleCall} activeOpacity={0.85}>
            <View style={[styles.quickIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="call" size={20} color="#10B981" />
            </View>
            <Text style={styles.quickTitle}>Call Support</Text>
            <Text style={styles.quickSub}>Toll-free 24/7</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={handleWhatsApp} activeOpacity={0.85}>
            <View style={[styles.quickIconWrap, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="logo-whatsapp" size={20} color="#16A34A" />
            </View>
            <Text style={styles.quickTitle}>WhatsApp</Text>
            <Text style={styles.quickSub}>Quick Chat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => Alert.alert('Safety SOS', 'Emergency dispatch helpline connected directly to police control room 112.')}
            activeOpacity={0.85}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="shield-checkmark" size={20} color="#EF4444" />
            </View>
            <Text style={styles.quickTitle}>Safety SOS</Text>
            <Text style={styles.quickSub}>Emergency 112</Text>
          </TouchableOpacity>
        </View>

        {/* FAQs Accordion */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          <View style={styles.faqCard}>
            {FAQS.map((faq, index) => {
              const isExpanded = expandedFaq === index
              return (
                <View key={index} style={[styles.faqItem, index < FAQS.length - 1 && styles.faqBorder]}>
                  <TouchableOpacity
                    style={styles.faqHeader}
                    onPress={() => setExpandedFaq(isExpanded ? null : index)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.faqQuestion}>{faq.q}</Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={COLORS.gray500}
                    />
                  </TouchableOpacity>
                  {isExpanded && (
                    <Text style={styles.faqAnswer}>{faq.a}</Text>
                  )}
                </View>
              )
            })}
          </View>
        </View>

        {/* Create Support Ticket Card */}
        <View style={styles.ticketCreateCard}>
          <View style={styles.ticketCreateHeader}>
            <Ionicons name="create-outline" size={20} color={COLORS.primary} />
            <Text style={styles.ticketCreateTitle}>Submit a Support Ticket</Text>
          </View>
          <Text style={styles.ticketCreateSub}>
            Have an issue with a ride, driver, or payment? Write to our dispatch center.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>SUBJECT</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Fare inquiry, driver delayed, lost item"
              value={subject}
              onChangeText={setSubject}
              placeholderTextColor={COLORS.gray400}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DETAILS</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Describe your issue in detail..."
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              placeholderTextColor={COLORS.gray400}
            />
          </View>

          {/* Priority Pill Selector */}
          <View style={styles.priorityRow}>
            {['low', 'medium', 'high'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.priorityPill, priority === p && styles.priorityPillActive]}
                onPress={() => setPriority(p)}
                activeOpacity={0.8}
              >
                <Text style={[styles.priorityText, priority === p && styles.priorityTextActive]}>
                  {p.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.btn}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <View style={styles.btnRow}>
                <Text style={styles.btnText}>Submit Support Request</Text>
                <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* My Support Tickets */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>My Past Tickets ({tickets.length})</Text>
          {!tickets.length ? (
            <EmptyState
              icon="chatbox-outline"
              title="No Tickets Raised"
              subtitle="Your submitted support queries and responses will appear here."
            />
          ) : (
            tickets.map(t => {
              const isOpen = t.status === 'open' || t.status === 'pending'
              return (
                <View key={t.id} style={styles.ticketCard}>
                  <View style={styles.ticketTopRow}>
                    <Text style={styles.ticketRef}>{t.ticket_ref || `#TCK-${t.id}`}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: isOpen ? '#FEF3C7' : '#ECFDF5' }]}>
                      <Text style={[styles.statusBadgeText, { color: isOpen ? '#B45309' : '#059669' }]}>
                        {t.status ? t.status.toUpperCase() : 'PENDING'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.ticketSubject}>{t.subject}</Text>
                  {t.message ? <Text style={styles.ticketMessage} numberOfLines={2}>{t.message}</Text> : null}
                  <Text style={styles.ticketDate}>
                    {t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN') : 'Recent'}
                  </Text>
                </View>
              )
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxxl,
  },
  quickContactRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: SPACING.lg,
  },
  quickCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray200,
    ...SHADOW.xs,
  },
  quickIconWrap: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
  },
  quickSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  sectionWrap: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  faqCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    ...SHADOW.xs,
  },
  faqItem: {
    paddingVertical: 14,
  },
  faqBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  faqAnswer: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 8,
  },
  ticketCreateCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xxl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    marginBottom: SPACING.lg,
    ...SHADOW.sm,
  },
  ticketCreateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  ticketCreateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  ticketCreateSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    paddingHorizontal: SPACING.md,
    height: 48,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
  },
  textarea: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.lg,
  },
  priorityPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
  },
  priorityPillActive: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray600,
  },
  priorityTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  btn: {
    height: 52,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.sm,
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
  ticketCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    ...SHADOW.xs,
  },
  ticketTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  ticketRef: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  ticketSubject: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  ticketMessage: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  ticketDate: {
    fontSize: 10,
    color: COLORS.gray400,
    marginTop: 6,
  },
})

export default SupportScreen
