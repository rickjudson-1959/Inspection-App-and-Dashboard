import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext({})

// Session timeout: 10 hours in milliseconds
const SESSION_TIMEOUT = 10 * 60 * 60 * 1000

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(null) // Track session errors

  async function fetchUserProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error)
      }
      setUserProfile(data)
    } catch (err) {
      console.error('Profile fetch error:', err)
    }
    setLoading(false)
  }

  async function handleSignOut(reason = null) {
    // Clear login time on sign out
    localStorage.removeItem('pipeup_login_time')
    if (reason) {
      setSessionError(reason)
    }
    await supabase.auth.signOut()
    setUser(null)
    setUserProfile(null)
  }

  // Clear session error (call after displaying error to user)
  const clearSessionError = useCallback(() => {
    setSessionError(null)
  }, [])

  // Check and enforce session timeout
  useEffect(() => {
    const checkSessionTimeout = () => {
      const loginTime = localStorage.getItem('pipeup_login_time')
      if (loginTime && user) {
        const elapsed = Date.now() - parseInt(loginTime)
        if (elapsed > SESSION_TIMEOUT) {
          console.log('Session expired after 10 hours - logging out')
          handleSignOut()
        }
      }
    }

    // Check immediately on load
    checkSessionTimeout()

    // Check every 5 minutes
    const interval = setInterval(checkSessionTimeout, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [user])

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        // Set login time if not already set (existing session)
        if (!localStorage.getItem('pipeup_login_time')) {
          localStorage.setItem('pipeup_login_time', Date.now().toString())
        }
        fetchUserProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] Event:', event, session ? 'has session' : 'no session')

      switch (event) {
        case 'SIGNED_IN':
          setUser(session?.user ?? null)
          setSessionError(null) // Clear any previous errors
          localStorage.setItem('pipeup_login_time', Date.now().toString())
          if (session?.user) {
            fetchUserProfile(session.user.id)
          }
          break

        case 'TOKEN_REFRESHED':
          // Token was successfully refreshed
          setUser(session?.user ?? null)
          if (session?.user) {
            fetchUserProfile(session.user.id)
          }
          break

        case 'SIGNED_OUT':
          // User signed out or token refresh failed
          console.log('[Auth] User signed out')
          localStorage.removeItem('pipeup_login_time')
          setUser(null)
          setUserProfile(null)
          setLoading(false)
          // If there's no session and user was previously logged in, it's likely a session expiry
          if (!session) {
            setSessionError('Your session has expired. Please sign in again.')
          }
          break

        case 'USER_UPDATED':
          setUser(session?.user ?? null)
          if (session?.user) {
            fetchUserProfile(session.user.id)
          }
          break

        case 'PASSWORD_RECOVERY':
          // User is in password recovery mode
          setUser(session?.user ?? null)
          break

        default:
          // Handle any other events
          setUser(session?.user ?? null)
          if (session?.user) {
            fetchUserProfile(session.user.id)
          } else {
            setUserProfile(null)
            setLoading(false)
          }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Keep signOut name for backwards compatibility
  const signOut = handleSignOut

  const value = {
    user,
    userProfile,
    loading,
    signOut,
    sessionError,
    clearSessionError,
    isAdmin: userProfile?.role === 'admin',
    isInspector: userProfile?.role === 'inspector',
    isPM: userProfile?.role === 'pm',
    isCM: userProfile?.role === 'cm',
    isChiefInspector: userProfile?.role === 'chief_inspector',
    isExecutive: userProfile?.role === 'executive',
    organizationId: userProfile?.organization_id
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
