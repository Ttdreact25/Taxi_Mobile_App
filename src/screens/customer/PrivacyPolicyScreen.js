import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const PrivacyPolicyScreen = ({ navigation }) => {
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
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Card */}
        <View style={styles.bannerCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.bannerTitle}>Your Privacy Matters to Us</Text>
          <Text style={styles.bannerSub}>
            CityDropTaxi is committed to protecting your personal data, privacy, and security in compliance with applicable laws and Google Play User Data Policies.
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Last Updated: September 2026</Text>
          </View>
        </View>

        {/* Section 1: Overview */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>1. Introduction</Text>
          <Text style={styles.bodyText}>
            This Privacy Policy describes how CityDropTaxi (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) collects, uses, stores, and protects information obtained from riders (customers) and driver partners through the CityDropTaxi mobile applications, website, and related ride-hailing services.
          </Text>
        </View>

        {/* Section 2: Data We Collect */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>2. Information We Collect</Text>
          
          <Text style={styles.subHeading}>A. Personal Information</Text>
          <Text style={styles.bodyText}>
            When you register an account, we collect your name, email address, mobile phone number, and account password (stored with cryptographic hashing).
          </Text>

          <Text style={styles.subHeading}>B. Location Information (Prominent Disclosure)</Text>
          <Text style={styles.bodyText}>
            • <Text style={{ fontWeight: '700' }}>For Customers / Riders:</Text> We collect precise and approximate location data when the app is in use (foreground) to locate your pickup point, calculate accurate trip distances, match nearby drivers, and provide real-time estimated arrival times.
          </Text>
          <Text style={styles.bodyText}>
            • <Text style={{ fontWeight: '700' }}>For Driver Partners:</Text> We collect real-time location data both when the app is in the foreground and in the background (via Android Foreground Service) when your status is set to &ldquo;Online&rdquo; or during an active trip. This is strictly required to calculate route navigation, transmit live vehicle position to riders, dispatch trip requests, compute accurate trip fares, and provide emergency SOS safety monitoring. Location tracking stops when you toggle your driver status to &ldquo;Offline&rdquo;.
          </Text>

          <Text style={styles.subHeading}>C. Driver Partner Verification & KYC</Text>
          <Text style={styles.bodyText}>
            To approve driver partners, we collect driving license records, vehicle registration certificates (RC), insurance documents, permit records, and facial selfie photos for identity verification and background vetting.
          </Text>

          <Text style={styles.subHeading}>D. Trip & Transaction Information</Text>
          <Text style={styles.bodyText}>
            We record trip details including pickup/drop locations, route polyline coordinates, date/time stamps, distance, toll charges, fare breakdown, and payment transaction references.
          </Text>
        </View>

        {/* Section 3: How We Use Data */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>3. How We Use Your Information</Text>
          <Text style={styles.bodyText}>
            We use your data solely for lawful operational purposes:
          </Text>
          <Text style={styles.bulletItem}>• Facilitating taxi booking, passenger-driver matching, and trip execution.</Text>
          <Text style={styles.bulletItem}>• Real-time GPS navigation and dynamic distance calculation.</Text>
          <Text style={styles.bulletItem}>• Processing digital payments, receipts, and driver earnings settlements.</Text>
          <Text style={styles.bulletItem}>• Passenger safety, identity verification, fraud prevention, and SOS response.</Text>
          <Text style={styles.bulletItem}>• Sending trip status SMS/push notifications and OTP security codes.</Text>
          <Text style={styles.bulletItem}>• Resolving customer support tickets and dispute settlements.</Text>
        </View>

        {/* Section 4: Data Sharing */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>4. Data Sharing & Third Parties</Text>
          <Text style={styles.bodyText}>
            We do NOT sell, rent, or trade your personal data to third-party advertisers. Information is only shared under the following conditions:
          </Text>
          <Text style={styles.bulletItem}>• <Text style={{ fontWeight: '700' }}>Between Riders and Drivers:</Text> Rider name, pickup point, and drop location are shared with assigned drivers. Driver name, photo, phone, vehicle model, and plate number are shared with riders.</Text>
          <Text style={styles.bulletItem}>• <Text style={{ fontWeight: '700' }}>Service Providers:</Text> Trusted infrastructure partners such as Google Maps Platform (map routing/geocoding), payment gateways (Razorpay), and SMS/push notification gateways under strict non-disclosure obligations.</Text>
          <Text style={styles.bulletItem}>• <Text style={{ fontWeight: '700' }}>Legal & Law Enforcement:</Text> When mandated by applicable law, court order, or governmental authority for passenger safety or crime prevention.</Text>
        </View>

        {/* Section 5: Account & Data Deletion */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>5. Account & Data Deletion (Google Play Compliant)</Text>
          <Text style={styles.bodyText}>
            In compliance with Google Play User Data policies, CityDropTaxi provides all users with the absolute right to delete their account and associated data:
          </Text>
          <Text style={styles.bulletItem}>
            • <Text style={{ fontWeight: '700' }}>In-App Deletion:</Text> Go to Profile &rarr; Delete Account. After double confirmation, your personal identity, contact numbers, email, profile photos, and saved places are immediately removed or permanently anonymized.
          </Text>
          <Text style={styles.bulletItem}>
            • <Text style={{ fontWeight: '700' }}>Web Deletion Request:</Text> You can also submit an account deletion request without installing the app at:
            {'\n'}https://taxi-backend.toptechsoftwaresolutions.in/delete-account.html
          </Text>
          <Text style={styles.bodyText}>
            * Note: Anonymized transaction history may be retained for statutory tax, financial accounting, and legal audit compliance as mandated by law.
          </Text>
        </View>

        {/* Section 6: Security */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>6. Security Standards</Text>
          <Text style={styles.bodyText}>
            We implement 256-bit SSL encryption, token-based authentication (Bearer JWT/API keys), salted password hashing, and strict role-based access controls to safeguard your data against unauthorized access, loss, or alteration.
          </Text>
        </View>

        {/* Section 7: Contact Us */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>7. Contact Us & Grievance Redressal</Text>
          <Text style={styles.bodyText}>
            If you have questions, feedback, or grievance requests concerning this Privacy Policy or your personal information, please contact us:
          </Text>
          <View style={styles.contactBox}>
            <Text style={styles.contactItem}><Text style={{ fontWeight: '700' }}>Company:</Text> CityDropTaxi Fleet Services</Text>
            <Text style={styles.contactItem}><Text style={{ fontWeight: '700' }}>Email:</Text> support@citydroptaxi.com</Text>
            <Text style={styles.contactItem}><Text style={{ fontWeight: '700' }}>Website:</Text> https://taxi-backend.toptechsoftwaresolutions.in</Text>
            <Text style={styles.contactItem}><Text style={{ fontWeight: '700' }}>Support Hotline:</Text> 24x7 In-App Help & SOS Desk</Text>
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
  subHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 10,
    marginBottom: 4,
  },
  bodyText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 6,
  },
  bulletItem: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 19,
    marginBottom: 6,
    paddingLeft: 4,
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

export default PrivacyPolicyScreen
