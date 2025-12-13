import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUserProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUserProfile(session.user.id)
      } else {
        setUserProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchUserProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          *,
          organizations (id, name, slug)
        `)
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

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setUserProfile(null)
  }

  const value = {
    user,
    userProfile,
    loading,
    signOut,
    isAdmin: userProfile?.role === 'admin',
    isInspector: userProfile?.role === 'inspector',
    isPM: userProfile?.role === 'pm',
    isCM: userProfile?.role === 'cm',
    isChiefInspector: userProfile?.role === 'chief_inspector',
    isExecutive: userProfile?.role === 'executive',
    organizationId: userProfile?.organization_id,
    organizationName: userProfile?.organizations?.name
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
