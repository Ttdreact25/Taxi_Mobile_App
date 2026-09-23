import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Linking
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supportAPI } from '../../api/api'
import { COLORS } from '../../constants/theme'

const DriverSupportScreen = ({ navigation }) => {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showModal, setShowModal] = useState(false)

  // Form State
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('trip_issue')

  useEffect(() => {
    loadTickets()
  }, [])

  const loadTickets = async () => {
    setLoading(true)
    try {
      const res = await supportAPI.myTickets()
      if (res.data?.status === 'success') {
        setTickets(res.data.data || [])
      }
    } catch (e) {
      console.log('Driver tickets error', e)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTicket = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Required Fields', 'Please provide a subject and detailed description of the issue.')
      return
    }

    setCreating(true)
    try {
      const res = await supportAPI.create({
        subject: `[Driver Support] ${subject}`,
        message,
        category,
      })

      if (res.data?.status === 'success') {
        Alert.alert('Ticket Raised', 'Our partner support team will contact you shortly.')
        setShowModal(false)
        setSubject('')
        setMessage('')
        loadTickets()
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to submit ticket.')
      }
    } catch (e) {
      Alert.alert('Error', 'Network error while creating ticket.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Help & SOS Support</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadTickets}>
          <Ionicons name="refresh" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Emergency SOS Hotline */}
        <View style={styles.sosCard}>
          <View style={styles.sosIconWrap}>
            <Ionicons name="warning" size={24} color="#EF4444" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.sosTitle}>Emergency 24x7 Safety Helpline</Text>
            <Text style={styles.sosDesc}>Immediate roadside, accident & safety assistance for on-duty drivers.</Text>
            <TouchableOpacity style={styles.callSosBtn} onPress={() => Linking.openURL('tel:112')}>
              <Ionicons name="call" size={14} color="#fff" />
              <Text style={styles.callSosText}>Call Emergency SOS (112)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Partner Support Contact */}
        <View style={styles.contactRow}>
          <TouchableOpacity style={styles.contactCard} onPress={() => Linking.openURL('tel:+919876543210')}>
            <Ionicons name="call-outline" size={22} color={COLORS.primary} />
            <Text style={styles.contactCardTitle}>Call Dispatch</Text>
            <Text style={styles.contactCardSub}>24x7 Control Room</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.contactCard} onPress={() => Linking.openURL('https://wa.me/919876543210')}>
            <Ionicons name="logo-whatsapp" size={22} color="#10B981" />
            <Text style={styles.contactCardTitle}>WhatsApp Help</Text>
            <Text style={styles.contactCardSub}>Instant Chat</Text>
          </TouchableOpacity>
        </View>

        {/* Ticket Header */}
        <View style={styles.ticketSectionHeader}>
          <Text style={styles.sectionTitle}>Support Tickets</Text>
          <TouchableOpacity style={styles.raiseBtn} onPress={() => setShowModal(true)}>
            <Ionicons name="add-circle" size={16} color="#fff" />
            <Text style={styles.raiseBtnText}>Raise Ticket</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 20 }} />
        ) : tickets.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={44} color={COLORS.gray400} />
            <Text style={styles.emptyTitle}>No Open Support Tickets</Text>
            <Text style={styles.emptyDesc}>Have an inquiry regarding payouts, toll adjustments, or fare issues? Raise a ticket above.</Text>
          </View>
        ) : (
          tickets.map((t) => (
            <View key={t.id} style={styles.ticketCard}>
              <View style={styles.ticketTopRow}>
                <Text style={styles.ticketId}>#{t.ticket_number || t.id}</Text>
                <View style={[styles.ticketBadge, t.status === 'resolved' ? styles.badgeResolved : styles.badgeOpen]}>
                  <Text style={[styles.badgeText, t.status === 'resolved' ? styles.badgeTextResolved : styles.badgeTextOpen]}>
                    {t.status?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.ticketSubject}>{t.subject}</Text>
              <Text style={styles.ticketMessage}>{t.message}</Text>
              {t.admin_response && (
                <View style={styles.adminReplyBox}>
                  <Text style={styles.adminReplyLabel}>Admin Resolution:</Text>
                  <Text style={styles.adminReplyText}>{t.admin_response}</Text>
                </View>
              )}
            </View>
          ))
        )}

        {/* Raise Modal */}
        {showModal && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Raise Support Inquiry</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={22} color={COLORS.dark} />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Inquiry Subject</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Fare settlement dispute or Toll refund"
                placeholderTextColor={COLORS.gray400}
                value={subject}
                onChangeText={setSubject}
              />

              <Text style={styles.inputLabel}>Detailed Description</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Describe your issue with trip reference ID if applicable..."
                placeholderTextColor={COLORS.gray400}
                multiline
                numberOfLines={4}
                value={message}
                onChangeText={setMessage}
              />

              <TouchableOpacity
                style={[styles.submitTicketBtn, creating && { opacity: 0.6 }]}
                onPress={handleCreateTicket}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitTicketText}>Submit to Dispatch Support</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.dark,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sosCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  sosIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#991B1B',
  },
  sosDesc: {
    fontSize: 11,
    color: '#B91C1C',
    marginTop: 2,
    lineHeight: 15,
  },
  callSosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
    gap: 6,
  },
  callSosText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  contactRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  contactCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  contactCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.dark,
    marginTop: 6,
  },
  contactCardSub: {
    fontSize: 10,
    color: COLORS.gray500,
    marginTop: 1,
  },
  ticketSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.dark,
  },
  raiseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  raiseBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  emptyWrap: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.dark,
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 11,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  ticketCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  ticketTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketId: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray500,
  },
  ticketBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeOpen: {
    backgroundColor: '#FEF3C7',
  },
  badgeResolved: {
    backgroundColor: '#D1FAE5',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgeTextOpen: {
    color: '#D97706',
  },
  badgeTextResolved: {
    color: '#059669',
  },
  ticketSubject: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark,
    marginTop: 4,
  },
  ticketMessage: {
    fontSize: 11,
    color: COLORS.gray600,
    marginTop: 2,
    lineHeight: 16,
  },
  adminReplyBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  adminReplyLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E40AF',
  },
  adminReplyText: {
    fontSize: 11,
    color: '#1E3A8A',
    marginTop: 2,
  },
  modalOverlay: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 4,
  },
  modalContent: {},
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.dark,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray700,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    fontSize: 12,
    color: COLORS.dark,
    marginBottom: 10,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  submitTicketBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  submitTicketText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
})

export default DriverSupportScreen
