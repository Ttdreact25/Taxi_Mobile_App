import 'react-native-gesture-handler'
import { enableScreens } from 'react-native-screens'
import { registerRootComponent } from 'expo'
import App from './App'

enableScreens(true)

if (typeof global !== 'undefined' && global.ErrorUtils) {
  const origHandler = global.ErrorUtils.getGlobalHandler && global.ErrorUtils.getGlobalHandler()
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('CRITICAL APP ERROR:', error)
    if (!isFatal && origHandler) {
      origHandler(error, false)
    }
  })
}

registerRootComponent(App)
