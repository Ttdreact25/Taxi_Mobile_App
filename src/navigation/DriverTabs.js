import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '../constants/theme'

// Driver screens
import DriverHomeScreen      from '../screens/driver/DriverHomeScreen'
import DriverTripsScreen     from '../screens/driver/DriverTripsScreen'
import EarningsScreen        from '../screens/driver/EarningsScreen'
import DriverProfileScreen   from '../screens/driver/DriverProfileScreen'
import DriverDocumentsScreen from '../screens/driver/DriverDocumentsScreen'
import DriverSupportScreen   from '../screens/driver/DriverSupportScreen'
import DriverNotifScreen     from '../screens/driver/DriverNotifScreen'
import DriverPaymentScreen   from '../screens/driver/DriverPaymentScreen'
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

const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="ProfileMain"         component={DriverProfileScreen} />
    <Stack.Screen name="DriverDocuments"     component={DriverDocumentsScreen} />
    <Stack.Screen name="DriverNotifications" component={DriverNotifScreen} />
    <Stack.Screen name="DriverSupport"       component={DriverSupportScreen} />
    <Stack.Screen name="Earnings"            component={EarningsScreen} />
    <Stack.Screen name="PrivacyPolicy"       component={PrivacyPolicyScreen} />
    <Stack.Screen name="Terms"               component={TermsScreen} />
  </Stack.Navigator>
)

const tabIcon = (route, focused) => {
  const icons = {
    Dashboard: focused ? 'car-sport' : 'car-sport-outline',
    Trips:     focused ? 'list'      : 'list-outline',
    Earnings:  focused ? 'cash'      : 'cash-outline',
    Profile:   focused ? 'person'    : 'person-outline',
  }
  return <Ionicons name={icons[route.name] || 'ellipse'} size={22} color={focused ? COLORS.primary : COLORS.gray400} />
}

const DriverTabs = () => {
  const insets = useSafeAreaInsets()
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 14)

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', paddingBottom: 2 },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray400,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.gray100,
          height: 56 + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
          elevation: 12,
        },
        tabBarIcon: ({ focused }) => tabIcon(route, focused),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Trips"     component={TripsStack}     options={{ title: 'Trips' }} />
      <Tab.Screen name="Earnings"  component={EarningsStack}  options={{ title: 'Earnings' }} />
      <Tab.Screen name="Profile"   component={ProfileStack}   options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}

export default DriverTabs
