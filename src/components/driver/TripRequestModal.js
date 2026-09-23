import React from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const TripRequestModal = ({ visible, request, onAccept, onDecline }) => {
  if (!request) return null

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Ionicons name="notifications" size={24} color={COLORS.primary} />
            <Text style={styles.title}>New Trip Request!</Text>
          </View>

          <Text style={styles.custName}>{request.customer_name}</Text>
          <Text style={styles.fare}>₹{request.fare_estimate}</Text>

          <View style={styles.routeBox}>
            <Text style={styles.routeText} numberOfLines={1}>🟢 {request.pickup_address}</Text>
            <Text style={styles.routeText} numberOfLines={1}>🔴 {request.dest_address}</Text>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.declineBtn} onPress={onDecline}>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
              <Text style={styles.acceptText}>Accept Trip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:{ backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, padding: SPACING.xl, gap: SPACING.md, ...SHADOW.lg },
  header:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title:       { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  custName:    { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  fare:        { fontSize: FONTS.sizes.xxl, fontWeight: '700', color: COLORS.primary },
  routeBox:    { backgroundColor: COLORS.gray50, borderRadius: RADIUS.lg, padding: SPACING.md, gap: 6 },
  routeText:   { fontSize: FONTS.sizes.sm, color: COLORS.text },
  btnRow:      { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  declineBtn:  { flex: 1, height: 50, borderRadius: RADIUS.lg, backgroundColor: COLORS.errorLight, alignItems: 'center', justifyContent: 'center' },
  declineText: { color: COLORS.error, fontWeight: '700', fontSize: FONTS.sizes.base },
  acceptBtn:   { flex: 2, height: 50, borderRadius: RADIUS.lg, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center' },
  acceptText:  { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.base },
})

export default TripRequestModal
