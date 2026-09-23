import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI, tokenManager, setOnUnauthorized } from '../api/api'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(async () => {
    try {
      await tokenManager.delete()
    } catch {}
    setUser(null)
  }, [])

  // Listen for global 401 Unauthorized responses
  useEffect(() => {
    setOnUnauthorized(() => {
      logout()
    })
  }, [logout])

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
    setUser(p => (typeof u === 'function' ? u(p) : { ...p, ...u }))
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, deleteAccount, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
