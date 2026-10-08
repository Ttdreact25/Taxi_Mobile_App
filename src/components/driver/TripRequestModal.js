import React from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const TripRequestModal = ({ visible, request, onAccept, onDecline }) => {
  if (!request) return null

  const fareVal = Math.round(Number(request.fare_estimate || request.final_fare || 0))
  const distanceKm = request.distance_km ? `${Number(request.distance_km).toFixed(1)} km` : 'Local Trip'

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.modalContent}>
          {/* Top Bar Indicator Handle */}
          <View style={styles.sheetHandle} />

          {/* Incoming Request Header */}
          <View style={styles.header}>
            <View style={styles.iconPulse}>
              <Ionicons name="car-sport" size={22} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.badgeText}>⚡ NEW RIDE REQUEST</Text>
              <Text style={styles.title}>Incoming Passenger</Text>
            </View>
            <View style={styles.fareWrap}>
              <Text style={styles.fareAmount}>₹{fareVal}</Text>
              <Text style={styles.fareLabel}>{request.payment_method?.toUpperCase() || 'CASH'}</Text>
            </View>
          </View>

          {/* Additional Pickup Charge Notice for Driver */}
          {Number(request.pickup_charge || request.extra_pickup_charge || 0) > 0 && (
            <View style={styles.pickupChargeBanner}>
              <View style={styles.pickupChargeIconWrap}>
                <Ionicons name="flash" size={14} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickupChargeTitle}>ADDITIONAL PICKUP CHARGE</Text>
                <Text style={styles.pickupChargeSubtitle}>
                  +₹{Math.round(Number(request.pickup_charge || request.extra_pickup_charge || 0))} extra for pickup ({Number(request.extra_pickup_distance_km || 0).toFixed(1)} km outside 2 km free radius)
                </Text>
              </View>
            </View>
          )}

          {/* Passenger Info Row */}
          <View style={styles.passRow}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.custName}>{request.customer_name || 'Passenger'}</Text>
              <Text style={styles.tripMeta}>{distanceKm} • {request.vehicle_type_name || request.vehicle_category_name || 'City Taxi'}</Text>
            </View>
          </View>

          {/* Route Box */}
          <View style={styles.routeBox}>
            <View style={styles.routeRow}>
              <View style={styles.dotPickup} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeLabel}>PICKUP LOCATION</Text>
                <Text style={styles.routeText} numberOfLines={2}>
                  {request.pickup_address}
                </Text>
              </View>
            </View>

            <View style={styles.routeDottedLine} />

            <View style={styles.routeRow}>
              <View style={styles.dotDrop} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeLabel}>DROP DESTINATION</Text>
                <Text style={styles.routeText} numberOfLines={2}>
                  {request.dest_address}
                </Text>
              </View>
            </View>
          </View>

          {/* Action CTA Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.declineBtn} onPress={onDecline} activeOpacity={0.8}>
              <Ionicons name="close" size={18} color={COLORS.error} />
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.88}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
              <Text style={styles.acceptText}>Accept Ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    paddingHorizontal: SPACING.xl,
    paddingTop: 12,
    paddingBottom: SPACING.xxxl,
    ...SHADOW.bottomSheet,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.gray300,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: SPACING.md,
  },
  iconPulse: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.6,
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '900',
    color: COLORS.text,
  },
  fareWrap: {
    alignItems: 'flex-end',
  },
  fareAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: '#10B981',
  },
  fareLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.gray100,
    marginBottom: SPACING.md,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  custName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.text,
  },
  tripMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  routeBox: {
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    marginBottom: SPACING.lg,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    marginTop: 4,
  },
  dotDrop: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    marginTop: 4,
  },
  routeDottedLine: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.gray300,
    marginLeft: 4,
    marginVertical: 2,
  },
  routeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  routeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 1,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  declineBtn: {
    flex: 1,
    height: 52,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.gray100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  declineText: {
    color: COLORS.error,
    fontWeight: '800',
    fontSize: FONTS.sizes.base,
  },
  acceptBtn: {
    flex: 2,
    height: 52,
    borderRadius: RADIUS.xl,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOW.sm,
  },
  acceptText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: FONTS.sizes.base,
  },
  pickupChargeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: RADIUS.lg,
    padding: 10,
    marginBottom: SPACING.md,
  },
  pickupChargeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupChargeTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  pickupChargeSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 1,
  },
})

export default TripRequestModal
