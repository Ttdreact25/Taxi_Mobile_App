import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const TermsScreen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Card */}
        <View style={styles.bannerCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="document-text" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.bannerTitle}>Terms and Conditions</Text>
          <Text style={styles.bannerSub}>
            Please review these terms carefully before using CityDropTaxi services, mobile applications, and driver partner platform.
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Effective Date: September 2026</Text>
          </View>
        </View>

        {/* Section 1 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>1. Acceptance of Terms</Text>
          <Text style={styles.bodyText}>
            By creating an account, accessing, or using the CityDropTaxi mobile applications or web platforms, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not download, register, or use the service.
          </Text>
        </View>

        {/* Section 2 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>2. Account Registration & Eligibility</Text>
          <Text style={styles.bodyText}>
            • You must be at least 18 years old to create a customer or driver partner account.
          </Text>
          <Text style={styles.bodyText}>
            • You agree to provide accurate, current, and complete information during registration and keep your account details updated.
          </Text>
          <Text style={styles.bodyText}>
            • You are responsible for safeguarding your login credentials and are solely liable for all activities under your account.
          </Text>
        </View>

        {/* Section 3 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>3. Ride Bookings & Fares</Text>
          <Text style={styles.bodyText}>
            • <Text style={{ fontWeight: '700' }}>Fare Calculation:</Text> Fares are calculated dynamically based on base fare, per-kilometer distance, duration, category type (e.g. Mini, Sedan, SUV, Long Trip, Shared Rides), and applicable night or peak surcharges.
          </Text>
          <Text style={styles.bodyText}>
            • <Text style={{ fontWeight: '700' }}>Tolls & Parking:</Text> Highway tolls, interstate permits, and parking fees incurred during trips are billed according to actual receipts and are the responsibility of the rider unless explicitly included in flat-rate packages.
          </Text>
          <Text style={styles.bodyText}>
            • <Text style={{ fontWeight: '700' }}>Payment:</Text> Payments may be made via digital payment gateways (UPI, Cards, NetBanking), app wallet balance, or cash directly to the driver upon trip completion.
          </Text>
        </View>

        {/* Section 4 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>4. Cancellations & Refund Policy</Text>
          <Text style={styles.bodyText}>
            • Riders may cancel bookings free of charge within the permissible grace period (e.g., 5 minutes from driver acceptance). Cancellations made after a driver has arrived or traveled significantly toward pickup may incur a nominal cancellation fee.
          </Text>
          <Text style={styles.bodyText}>
            • Refunds for failed transactions or overcharges are processed through our 24x7 support desk back to the original payment method within 5 to 7 business days.
          </Text>
        </View>

        {/* Section 5 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>5. Driver Partner Terms & Vehicle Standards</Text>
          <Text style={styles.bodyText}>
            • Driver partners operate as independent transportation service providers and must maintain valid commercial driving licenses, vehicle registrations (RC), vehicle insurance, and statutory permits.
          </Text>
          <Text style={styles.bodyText}>
            • Drivers must keep vehicles clean, roadworthy, equipped with functional safety belts, and pass periodic verification inspections.
          </Text>
          <Text style={styles.bodyText}>
            • Driver partners agree to adhere to platform commission rates and settlement schedules as agreed upon registration.
          </Text>
        </View>

        {/* Section 6 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>6. Safety & Code of Conduct</Text>
          <Text style={styles.bodyText}>
            • Users and driver partners agree to treat each other with mutual respect and dignity.
          </Text>
          <Text style={styles.bodyText}>
            • Strictly prohibited: Verbal abuse, discrimination, physical violence, dangerous driving, carrying illicit substances, smoking, or consuming alcohol during rides.
          </Text>
          <Text style={styles.bodyText}>
            • Any violation may result in immediate suspension or permanent termination of account privileges without prior notice.
          </Text>
        </View>

        {/* Section 7 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>7. Limitation of Liability</Text>
          <Text style={styles.bodyText}>
            CityDropTaxi acts as a technology intermediary platform connecting independent riders with transportation providers. While we perform driver vetting and provide real-time GPS monitoring and SOS support, CityDropTaxi is not liable for indirect, incidental, or consequential damages resulting from third-party actions, force majeure, or road delays beyond our reasonable control.
          </Text>
        </View>

        {/* Section 8 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>8. Termination & Account Deletion</Text>
          <Text style={styles.bodyText}>
            You may terminate these terms at any time by permanently deleting your account through the app settings or via our web portal. We reserve the right to suspend accounts that violate safety guidelines or engage in fraudulent activities.
          </Text>
        </View>

        {/* Section 9 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>9. Governing Law & Support</Text>
          <Text style={styles.bodyText}>
            These terms are governed by and construed in accordance with the laws of India. For questions or disputes, contact:
          </Text>
          <View style={styles.contactBox}>
            <Text style={styles.contactItem}><Text style={{ fontWeight: '700' }}>Platform:</Text> CityDropTaxi</Text>
            <Text style={styles.contactItem}><Text style={{ fontWeight: '700' }}>Legal Inquiries:</Text> legal@citydroptaxi.com</Text>
            <Text style={styles.contactItem}><Text style={{ fontWeight: '700' }}>Help & Support:</Text> support@citydroptaxi.com</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.white,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 40,
  },
  bannerCard: {
    backgroundColor: '#1E293B',
    borderRadius: RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: SPACING.lg,
    ...SHADOW.md,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 8,
  },
  bannerSub: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 19,
  },
  badge: {
    backgroundColor: 'rgba(79, 70, 229, 0.2)',
    borderWidth: 1,
    borderColor: '#6366F1',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#A5B4FC',
  },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.xs,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
  },
  bodyText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 6,
  },
  contactBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  contactItem: {
    fontSize: 12,
    color: '#334155',
    marginBottom: 4,
  },
})

export default TermsScreen
