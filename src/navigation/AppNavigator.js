import React, { useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import SplashScreen from '../components/common/SplashScreen'

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

import { View, StyleSheet } from 'react-native'

const Stack = createNativeStackNavigator()

const AppNavigator = () => {
  const { user, loading } = useAuth()
  const [splashFinished, setSplashFinished] = useState(false)

  const showSplash = loading || !splashFinished

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {showSplash ? (
          <Stack.Screen name="Splash">
            {(props) => <SplashScreen {...props} onFinish={() => setSplashFinished(true)} />}
          </Stack.Screen>
        ) : !user ? (
          // Auth Flow
          <Stack.Group>
            <Stack.Screen name="Login"         component={LoginScreen} />
            <Stack.Screen name="Register"      component={RegisterScreen} />
            <Stack.Screen name="OTP"           component={OTPScreen} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="Terms"         component={TermsScreen} />
          </Stack.Group>
        ) : user.role_slug === 'driver' ? (
          // Driver Flow
          <Stack.Group>
            <Stack.Screen name="DriverTabs"    component={DriverTabs} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="Terms"         component={TermsScreen} />
          </Stack.Group>
        ) : (
          // Customer Flow
          <Stack.Group>
            <Stack.Screen name="CustomerTabs"  component={CustomerTabs} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="Terms"         component={TermsScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
})

export default AppNavigator
