'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { APIRoutes } from '@/api/routes'

export default function LoginPage() {
  const router = useRouter()
  const {
    selectedEndpoint,
    authToken,
    hydrated,
    setAuthToken,
    setUsername,
    setUserRole
  } = useStore()

  const [usernameInput, setUsernameInput] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Already authenticated → go home
  useEffect(() => {
    if (hydrated && authToken) {
      router.replace('/')
    }
  }, [hydrated, authToken, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(APIRoutes.Login(selectedEndpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError((data as { detail?: string }).detail || 'Invalid credentials')
        return
      }

      const data = await response.json() as {
        access_token: string
        username: string
        role: 'admin' | 'user'
      }
      setAuthToken(data.access_token)
      setUsername(data.username)
      setUserRole(data.role)
      router.replace('/')
    } catch {
      setError('Cannot connect to backend. Is the server running?')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background font-dmmono">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-primary/15 bg-accent/30 p-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-4">
            <Icon type="agent" size="xs" />
            <span className="text-xs font-medium uppercase text-white">
              Data Agent
            </span>
          </div>
          <h1 className="text-xl font-medium text-foreground">Sign in</h1>
          <p className="text-sm text-muted">Enter your credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase text-muted">
              Username
            </label>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="username"
              required
              autoFocus
              className="flex h-11 w-full rounded-xl border border-primary/15 bg-background px-4 text-sm font-medium text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase text-muted">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="flex h-11 w-full rounded-xl border border-primary/15 bg-background px-4 text-sm font-medium text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={isLoading || !usernameInput || !password}
            className="h-11 w-full rounded-xl bg-primary text-xs font-medium uppercase text-background hover:bg-primary/80"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-xs text-muted">
          Connecting to{' '}
          <span className="text-foreground">{selectedEndpoint}</span>
        </p>
      </div>
    </div>
  )
}
