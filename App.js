import React, { Component, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, LogBox } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/context/AuthContext'
import { CorporateAlertProvider } from './src/components/common/CorporateAlertProvider'
import AppNavigator from './src/navigation/AppNavigator'
import PushNotificationService from './src/services/PushNotificationService'
import './src/services/DriverForegroundService'

LogBox.ignoreLogs([
  'Error registering for push notifications',
  'expo-notifications: Android Push notifications',
  'Android Push notifications (remote notifications)',
  'was removed from Expo Go with the release of SDK 53',
  'Push notification permission was denied',
])

class GlobalErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Crash caught by ErrorBoundary:', error, errorInfo)
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <StatusBar style="light" />
          <View style={errorStyles.card}>
            <Text style={errorStyles.icon}>⚠️</Text>
            <Text style={errorStyles.title}>CityOneTaxi</Text>
            <Text style={errorStyles.subtitle}>Something went wrong during startup</Text>
            <ScrollView style={errorStyles.errorBox}>
              <Text style={errorStyles.errorText}>
                {String(this.state.error?.message || this.state.error || 'Unknown error')}
              </Text>
            </ScrollView>
            <TouchableOpacity style={errorStyles.btn} onPress={this.handleRestart}>
              <Text style={errorStyles.btnText}>Restart App</Text>
            </TouchableOpacity>
          </View>
        </View>
      )
    }
    return this.props.children
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FBBF24',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorBox: {
    maxHeight: 120,
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
  },
  btn: {
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  btnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },
})

import * as ExpoSplashScreen from 'expo-splash-screen'

// Keep native launch screen visible seamlessly while JS bundle is initializing
ExpoSplashScreen.preventAutoHideAsync().catch(() => {})

export default function App() {
  useEffect(() => {
    PushNotificationService.setupAndroidNotificationChannels().catch(() => {})
  }, [])

  return (
    <GlobalErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <CorporateAlertProvider>
            <StatusBar style="dark" />
            <AppNavigator />
          </CorporateAlertProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GlobalErrorBoundary>
  )
}

