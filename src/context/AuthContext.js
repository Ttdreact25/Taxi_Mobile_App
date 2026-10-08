import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import { authAPI, tokenManager, setOnUnauthorized } from '../api/api'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(async (callApi = true) => {
    if (callApi) {
      try {
        await authAPI.logout()
      } catch {}
    }
    try {
      await tokenManager.delete()
    } catch {}
    setUser(null)
  }, [])

  // Listen for global 401 Unauthorized responses & single device login invalidation
  useEffect(() => {
    setOnUnauthorized((info) => {
      logout(false)
      const msg = info?.message || 'Your account has been logged in from another device. Please login again.'
      Alert.alert(
        'Logged Out',
        msg,
        [{ text: 'OK' }],
        { cancelable: false }
      )
    })
  }, [logout])

  // Active session heartbeat: detect remote login from another phone immediately
  useEffect(() => {
    if (!user) return
    const timer = setInterval(async () => {
      try {
        const res = await authAPI.verify()
        if (res.data?.status !== 'success') {
          logout(false)
        }
      } catch {
        // Any 401 will be captured by axios response interceptor
      }
    }, 10000)
    return () => clearInterval(timer)
  }, [user, logout])

  useEffect(() => {
    const init = async () => {
      try {
        const token = await tokenManager.get()
        if (!token) {
          setLoading(false)
          return
        }
        const res = await authAPI.verify()
        if (res.data?.status === 'success' && res.data.user) {
          setUser(res.data.user)
        } else {
          await tokenManager.delete()
          setUser(null)
        }
      } catch {
        await tokenManager.delete()
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const login = async (identifier, password) => {
    const res = await authAPI.login({ identifier, password })
    if (res.data?.requires_otp || res.data?.status === 'requires_otp') {
      return {
        requires_otp: true,
        email: res.data.email,
        phone: res.data.phone,
        role: res.data.role || 'driver',
        otp: res.data.otp,
        message: res.data.message
      }
    }
    if (res.data?.status === 'success') {
      await tokenManager.save(res.data.token)
      setUser(res.data.user)
      return res.data.user
    }
    throw new Error(res.data?.message || 'Login failed')
  }

  const refreshUser = async () => {
    try {
      const res = await authAPI.verify()
      if (res.data?.status === 'success' && res.data.user) {
        setUser(res.data.user)
        return res.data.user
      }
    } catch {}
    return null
  }

  const deleteAccount = async (confirmation = '') => {
    const res = await authAPI.deleteAccount({ confirm: confirmation })
    if (res.data?.status === 'success') {
      await logout()
      return res.data
    }
    throw new Error(res.data?.message || 'Could not delete account')
  }

  const updateUser = (u) => {
    setUser(p => {
      if (!p) return typeof u === 'function' ? u(null) : u
      return typeof u === 'function' ? u(p) : { ...p, ...u }
    })
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, deleteAccount, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
