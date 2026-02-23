'use client'
import Sidebar from '@/components/chat/Sidebar/Sidebar'
import { ChatArea } from '@/components/chat/ChatArea'
import { Suspense } from 'react'
import { useAuthGuard } from '@/hooks/useAuthGuard'

export default function Home() {
  const { isAuthenticated } = useAuthGuard()

  if (!isAuthenticated) return null

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div className="flex h-screen bg-background/80">
        <Sidebar />
        <ChatArea />
      </div>
    </Suspense>
  )
}
