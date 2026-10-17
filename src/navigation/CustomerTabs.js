import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Platform, View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, RADIUS } from '../constants/theme'

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

const Tab   = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

const HomeStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="HomeScreen"           component={HomeScreen} />
    <Stack.Screen name="Booking"              component={BookingScreen} />
    <Stack.Screen name="SavedPlaces"          component={SavedPlacesScreen} />
    <Stack.Screen name="LongTrip"             component={BookingScreen} initialParams={{ tripMode: 'outstation' }} />
    <Stack.Screen name="SharedTrips"          component={SharedTripsScreen} />
    <Stack.Screen name="BookingTrack"         component={BookingTrackScreen} />
    <Stack.Screen name="Ticket"               component={TicketScreen} />
    <Stack.Screen name="IdentityVerification" component={IdentityVerificationScreen} />
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
    <Stack.Screen name="LongTrip"             component={BookingScreen} initialParams={{ tripMode: 'outstation' }} />
    <Stack.Screen name="SharedTrips"          component={SharedTripsScreen} />
  </Stack.Navigator>
)

const TripsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="TripsList"            component={TripHistoryScreen} />
    <Stack.Screen name="Ticket"               component={TicketScreen} />
    <Stack.Screen name="BookingTrack"         component={BookingTrackScreen} />
    <Stack.Screen name="LongTrip"             component={BookingScreen} initialParams={{ tripMode: 'outstation' }} />
    <Stack.Screen name="SharedTrips"          component={SharedTripsScreen} />
    <Stack.Screen name="IdentityVerification" component={IdentityVerificationScreen} />
  </Stack.Navigator>
)

const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="ProfileMain"          component={ProfileScreen} />
    <Stack.Screen name="SavedPlaces"          component={SavedPlacesScreen} />
    <Stack.Screen name="IdentityVerification" component={IdentityVerificationScreen} />
    <Stack.Screen name="Notifications"        component={NotifScreen} />
    <Stack.Screen name="Support"              component={SupportScreen} />
    <Stack.Screen name="Ticket"               component={TicketScreen} />
    <Stack.Screen name="TripsList"            component={TripHistoryScreen} />
    <Stack.Screen name="PrivacyPolicy"        component={PrivacyPolicyScreen} />
    <Stack.Screen name="Terms"                component={TermsScreen} />
  </Stack.Navigator>
)

const TabIcon = ({ routeName, focused }) => {
  const icons = {
    Home:    focused ? 'home'   : 'home-outline',
    Booking: focused ? 'car'    : 'car-outline',
    Trips:   focused ? 'time'   : 'time-outline',
    Profile: focused ? 'person' : 'person-outline',
  }
  
  return (
    <View style={[styles.iconPill, focused && styles.iconPillActive]}>
      <Ionicons
        name={icons[routeName] || 'ellipse'}
        size={22}
        color={focused ? '#D97706' : COLORS.gray400}
      />
    </View>
  )
}

const CustomerTabs = () => {
  const insets = useSafeAreaInsets()
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 22 : 12)

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          paddingBottom: 2,
          marginTop: -2,
        },
        tabBarActiveTintColor: '#D97706',
        tabBarInactiveTintColor: COLORS.gray400,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.gray100,
          height: 60 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
          elevation: 12,
        },
        tabBarIcon: ({ focused }) => <TabIcon routeName={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen name="Home"    component={HomeStack}    options={{ title: 'Home' }} />
      <Tab.Screen name="Booking" component={BookingStack} options={{ title: 'Book Ride' }} />
      <Tab.Screen name="Trips"   component={TripsStack}   options={{ title: 'My Trips' }} />
      <Tab.Screen name="Profile" component={ProfileStack} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  iconPill: {
    width: 44,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: '#FEF3C7',
  },
})

export default CustomerTabs
