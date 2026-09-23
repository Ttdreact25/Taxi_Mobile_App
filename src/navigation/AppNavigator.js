import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { ActivityIndicator, View } from 'react-native'
import { COLORS } from '../constants/theme'

// Auth Screens
import LoginScreen         from '../screens/auth/LoginScreen'
import RegisterScreen      from '../screens/auth/RegisterScreen'
import OTPScreen           from '../screens/auth/OTPScreen'

// Customer Screens
import CustomerTabs        from './CustomerTabs'

// Driver Screens
import DriverTabs          from './DriverTabs'

// Legal & Compliance Screens
import PrivacyPolicyScreen from '../screens/customer/PrivacyPolicyScreen'
import TermsScreen         from '../screens/customer/TermsScreen'

const Stack = createNativeStackNavigator()

const AppNavigator = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!user ? (
          // Auth Flow
          <>
            <Stack.Screen name="Login"         component={LoginScreen} />
            <Stack.Screen name="Register"      component={RegisterScreen} />
            <Stack.Screen name="OTP"           component={OTPScreen} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="Terms"         component={TermsScreen} />
          </>
        ) : user.role_slug === 'driver' ? (
          // Driver Flow
          <>
            <Stack.Screen name="DriverTabs"    component={DriverTabs} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="Terms"         component={TermsScreen} />
          </>
        ) : (
          // Customer Flow
          <>
            <Stack.Screen name="CustomerTabs"  component={CustomerTabs} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="Terms"         component={TermsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default AppNavigator
