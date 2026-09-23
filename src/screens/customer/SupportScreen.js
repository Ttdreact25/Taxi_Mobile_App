import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supportAPI } from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const SupportScreen = ({ navigation }) => {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supportAPI.myTickets().then(r => setTickets(r.data?.tickets || [])).catch(() => {})
  }, [])

  const handleSubmit = async () => {
    if (!subject || !message) { Alert.alert('Error', 'Please fill subject and message'); return }
    setLoading(true)
    try {
      const res = await supportAPI.create({ subject, message, priority: 'medium' })
      if (res.data?.status === 'success') {
        Alert.alert('Ticket Created!', 'Our support team will contact you shortly.')
        setSubject(''); setMessage('')
        const r = await supportAPI.myTickets()
        setTickets(r.data?.tickets || [])
      } else { Alert.alert('Error', res.data?.message || 'Failed') }
    } catch { Alert.alert('Error', 'Submission failed') }
    finally { setLoading(false) }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create Support Ticket</Text>
          <TextInput style={styles.input} placeholder="Subject" value={subject} onChangeText={setSubject} placeholderTextColor={COLORS.gray400} />
          <TextInput style={[styles.input, styles.textarea]} placeholder="Describe your issue..." value={message} onChangeText={setMessage} multiline numberOfLines={4} placeholderTextColor={COLORS.gray400} />
          <TouchableOpacity style={styles.btn} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.btnText}>Submit Ticket</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>My Support Tickets</Text>
        {!tickets.length ? (
          <Text style={styles.emptyText}>No tickets raised</Text>
        ) : (
          tickets.map(t => (
            <View key={t.id} style={styles.ticketCard}>
              <View style={styles.row}>
                <Text style={styles.ticketRef}>{t.ticket_ref}</Text>
                <Text style={styles.status}>{t.status}</Text>
              </View>
              <Text style={styles.subject}>{t.subject}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.background },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  back:        { width: 38, height: 38, borderRadius: RADIUS.lg, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  card:        { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOW.sm },
  cardTitle:   { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  input:       { backgroundColor: COLORS.gray50, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.gray200, paddingHorizontal: SPACING.md, height: 48, fontSize: FONTS.sizes.base, color: COLORS.text, marginBottom: SPACING.md },
  textarea:    { height: 100, textAlignVertical: 'top', paddingTop: SPACING.md },
  btn:         { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, height: 48, alignItems: 'center', justifyContent: 'center' },
  btnText:     { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.base },
  sectionTitle:{ fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  ticketCard:  { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOW.sm },
  row:         { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  ticketRef:   { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.primary, fontFamily: 'monospace' },
  status:      { fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', color: COLORS.info },
  subject:     { fontSize: FONTS.sizes.sm, color: COLORS.text },
  emptyText:   { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
})

export default SupportScreen
