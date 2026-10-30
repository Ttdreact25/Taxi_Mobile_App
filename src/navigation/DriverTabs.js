import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Platform, View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, RADIUS } from '../constants/theme'

// Driver screens
import DriverHomeScreen      from '../screens/driver/DriverHomeScreen'
import DriverTripsScreen     from '../screens/driver/DriverTripsScreen'
import EarningsScreen        from '../screens/driver/EarningsScreen'
import DriverProfileScreen   from '../screens/driver/DriverProfileScreen'
import DriverDocumentsScreen from '../screens/driver/DriverDocumentsScreen'
import DriverSupportScreen   from '../screens/driver/DriverSupportScreen'
import DriverNotifScreen     from '../screens/driver/DriverNotifScreen'
import DriverPaymentScreen   from '../screens/driver/DriverPaymentScreen'
import DriverReviewsScreen   from '../screens/driver/DriverReviewsScreen'
import PrivacyPolicyScreen  from '../screens/customer/PrivacyPolicyScreen'
import TermsScreen          from '../screens/customer/TermsScreen'

const Tab   = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

const DashboardStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="DashboardHome"       component={DriverHomeScreen} />
    <Stack.Screen name="DriverPayment"       component={DriverPaymentScreen} />
    <Stack.Screen name="DriverNotifications" component={DriverNotifScreen} />
    <Stack.Screen name="DriverSupport"       component={DriverSupportScreen} />
    <Stack.Screen name="DriverDocuments"     component={DriverDocumentsScreen} />
    <Stack.Screen name="DriverTrips"         component={DriverTripsScreen} />
    <Stack.Screen name="DriverReviews"       component={DriverReviewsScreen} />
    <Stack.Screen name="PrivacyPolicy"       component={PrivacyPolicyScreen} />
    <Stack.Screen name="Terms"               component={TermsScreen} />
  </Stack.Navigator>
)

const TripsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="TripsMain"           component={DriverTripsScreen} />
    <Stack.Screen name="DriverPayment"       component={DriverPaymentScreen} />
    <Stack.Screen name="DriverSupport"       component={DriverSupportScreen} />
  </Stack.Navigator>
)

const EarningsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="EarningsMain"        component={EarningsScreen} />
    <Stack.Screen name="DriverSupport"       component={DriverSupportScreen} />
  </Stack.Navigator>
)

const NotificationsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="NotificationsMain"   component={DriverNotifScreen} />
    <Stack.Screen name="DriverSupport"       component={DriverSupportScreen} />
  </Stack.Navigator>
)

const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="ProfileMain"         component={DriverProfileScreen} />
    <Stack.Screen name="DriverDocuments"     component={DriverDocumentsScreen} />
    <Stack.Screen name="DriverNotifications" component={DriverNotifScreen} />
    <Stack.Screen name="DriverSupport"       component={DriverSupportScreen} />
    <Stack.Screen name="DriverReviews"       component={DriverReviewsScreen} />
    <Stack.Screen name="Earnings"            component={EarningsScreen} />
    <Stack.Screen name="PrivacyPolicy"       component={PrivacyPolicyScreen} />
    <Stack.Screen name="Terms"               component={TermsScreen} />
  </Stack.Navigator>
)

const TabIcon = ({ routeName, focused }) => {
  const icons = {
    Dashboard: { active: 'speedometer',   inactive: 'speedometer-outline' },
    Trips:     { active: 'list',          inactive: 'list-outline' },
    Earnings:  { active: 'cash',          inactive: 'cash-outline' },
    Profile:   { active: 'person',        inactive: 'person-outline' },
  }

  const iconSet = icons[routeName] || { active: 'ellipse', inactive: 'ellipse-outline' }

  return (
    <View style={[styles.iconPill, focused && styles.iconPillActive]}>
      <Ionicons
        name={focused ? iconSet.active : iconSet.inactive}
        size={25}
        color={focused ? '#0F172A' : '#64748B'}
      />
    </View>
  )
}

const DriverTabs = () => {
  const insets = useSafeAreaInsets()
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 10)

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          paddingBottom: 2,
          marginTop: -1,
          letterSpacing: 0.2,
        },
        tabBarActiveTintColor: '#0F172A',
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#F1F5F9',
          height: 66 + bottomInset,
          paddingTop: 5,
          paddingBottom: bottomInset,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 16,
        },
        tabBarIcon: ({ focused }) => <TabIcon routeName={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Trips"     component={TripsStack}     options={{ title: 'Trips' }} />
      <Tab.Screen name="Earnings"  component={EarningsStack}  options={{ title: 'Earnings' }} />
      <Tab.Screen name="Profile"   component={ProfileStack}   options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  iconPill: {
    width: 52,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: '#FFC700',
    transform: [{ scale: 1.05 }],
  },
})

export default DriverTabs
