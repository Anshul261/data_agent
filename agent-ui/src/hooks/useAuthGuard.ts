'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/store'

export function useAuthGuard() {
  const router = useRouter()
  const { authToken, hydrated } = useStore()

  useEffect(() => {
    if (hydrated && !authToken) {
      router.replace('/login')
    }
  }, [hydrated, authToken, router])

  return { isAuthenticated: !!authToken }
}
