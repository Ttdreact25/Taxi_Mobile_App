import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '../constants/theme'

// Customer screens
import HomeScreen                 from '../screens/customer/HomeScreen'
import BookingScreen              from '../screens/customer/BookingScreen'
import LongTripScreen             from '../screens/customer/LongTripScreen'
import SharedTripsScreen          from '../screens/customer/SharedTripsScreen'
import BookingTrackScreen         from '../screens/customer/BookingTrackScreen'
import TripHistoryScreen          from '../screens/customer/TripHistoryScreen'
import ProfileScreen              from '../screens/customer/ProfileScreen'
import NotifScreen                from '../screens/customer/NotifScreen'
import SupportScreen              from '../screens/customer/SupportScreen'
import TicketScreen               from '../screens/customer/TicketScreen'
import IdentityVerificationScreen from '../screens/customer/IdentityVerificationScreen'
import SavedPlacesScreen          from '../screens/customer/SavedPlacesScreen'
import PrivacyPolicyScreen        from '../screens/customer/PrivacyPolicyScreen'
import TermsScreen                from '../screens/customer/TermsScreen'

import DriverDocumentsScreen from '../screens/driver/DriverDocumentsScreen'

const Tab   = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

const HomeStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="HomeScreen"           component={HomeScreen} />
    <Stack.Screen name="Booking"              component={BookingScreen} />
    <Stack.Screen name="SavedPlaces"          component={SavedPlacesScreen} />
    <Stack.Screen name="LongTrip"             component={LongTripScreen} />
    <Stack.Screen name="SharedTrips"          component={SharedTripsScreen} />
    <Stack.Screen name="BookingTrack"         component={BookingTrackScreen} />
    <Stack.Screen name="Ticket"               component={TicketScreen} />
    <Stack.Screen name="IdentityVerification" component={IdentityVerificationScreen} />
    <Stack.Screen name="DriverDocuments"     component={DriverDocumentsScreen} />
    <Stack.Screen name="Notifications"        component={NotifScreen} />
    <Stack.Screen name="Support"              component={SupportScreen} />
    <Stack.Screen name="PrivacyPolicy"        component={PrivacyPolicyScreen} />
    <Stack.Screen name="Terms"                component={TermsScreen} />
  </Stack.Navigator>
)

const BookingStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="BookingHome"          component={BookingScreen} />
    <Stack.Screen name="SavedPlaces"          component={SavedPlacesScreen} />
    <Stack.Screen name="BookingTrack"         component={BookingTrackScreen} />
    <Stack.Screen name="Ticket"               component={TicketScreen} />
    <Stack.Screen name="LongTrip"             component={LongTripScreen} />
    <Stack.Screen name="SharedTrips"          component={SharedTripsScreen} />
  </Stack.Navigator>
)

const TripsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="TripsList"            component={TripHistoryScreen} />
    <Stack.Screen name="Ticket"               component={TicketScreen} />
    <Stack.Screen name="BookingTrack"         component={BookingTrackScreen} />
    <Stack.Screen name="LongTrip"             component={LongTripScreen} />
    <Stack.Screen name="SharedTrips"          component={SharedTripsScreen} />
    <Stack.Screen name="IdentityVerification" component={IdentityVerificationScreen} />
  </Stack.Navigator>
)

const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="ProfileMain"          component={ProfileScreen} />
    <Stack.Screen name="SavedPlaces"          component={SavedPlacesScreen} />
    <Stack.Screen name="DriverDocuments"     component={DriverDocumentsScreen} />
    <Stack.Screen name="IdentityVerification" component={IdentityVerificationScreen} />
    <Stack.Screen name="Notifications"        component={NotifScreen} />
    <Stack.Screen name="Support"              component={SupportScreen} />
    <Stack.Screen name="Ticket"               component={TicketScreen} />
    <Stack.Screen name="TripsList"            component={TripHistoryScreen} />
    <Stack.Screen name="PrivacyPolicy"        component={PrivacyPolicyScreen} />
    <Stack.Screen name="Terms"                component={TermsScreen} />
  </Stack.Navigator>
)

const tabIcon = (route, focused) => {
  const icons = {
    Home:    focused ? 'home'   : 'home-outline',
    Booking: focused ? 'car'    : 'car-outline',
    Trips:   focused ? 'time'   : 'time-outline',
    Profile: focused ? 'person' : 'person-outline',
  }
  return <Ionicons name={icons[route.name] || 'ellipse'} size={22} color={focused ? COLORS.primary : COLORS.gray400} />
}

const CustomerTabs = () => {
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
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 12,
        },
        tabBarIcon: ({ focused }) => tabIcon(route, focused),
      })}
    >
      <Tab.Screen name="Home"    component={HomeStack}    options={{ title: 'Home' }} />
      <Tab.Screen name="Booking" component={BookingStack} options={{ title: 'Book' }} />
      <Tab.Screen name="Trips"   component={TripsStack}   options={{ title: 'My Trips' }} />
      <Tab.Screen name="Profile" component={ProfileStack} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}

export default CustomerTabs
