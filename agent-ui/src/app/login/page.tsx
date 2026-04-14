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
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryUsername, setRecoveryUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
  const [recoverySuccess, setRecoverySuccess] = useState('')

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

  const handleRecoverPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setRecoveryError('')
    setRecoverySuccess('')
    setIsRecovering(true)

    try {
      const response = await fetch(APIRoutes.RecoverPassword(selectedEndpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: recoveryUsername,
          new_password: newPassword,
          recovery_key: recoveryKey
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setRecoveryError(
          (data as { detail?: string }).detail || 'Password reset failed'
        )
        return
      }

      setRecoverySuccess('Password reset successful. Sign in with the new password.')
      setUsernameInput(recoveryUsername)
      setPassword(newPassword)
      setShowRecovery(false)
    } catch {
      setRecoveryError('Cannot connect to backend. Is the server running?')
    } finally {
      setIsRecovering(false)
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

        <div className="space-y-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setShowRecovery((prev) => !prev)
              setRecoveryError('')
              setRecoverySuccess('')
              if (!showRecovery) {
                setRecoveryUsername(usernameInput || 'admin')
              }
            }}
            className="h-9 w-full rounded-xl text-xs font-medium uppercase text-muted hover:text-foreground"
          >
            {showRecovery ? 'Hide Recovery' : 'Forgot Password?'}
          </Button>

          {showRecovery && (
            <form onSubmit={handleRecoverPassword} className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase text-muted">
                  Username
                </label>
                <input
                  type="text"
                  value={recoveryUsername}
                  onChange={(e) => setRecoveryUsername(e.target.value)}
                  required
                  className="flex h-10 w-full rounded-xl border border-primary/15 bg-background px-4 text-sm font-medium text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase text-muted">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  className="flex h-10 w-full rounded-xl border border-primary/15 bg-background px-4 text-sm font-medium text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase text-muted">
                  Recovery Key
                </label>
                <input
                  type="password"
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  placeholder="AUTH_RECOVERY_KEY"
                  required
                  className="flex h-10 w-full rounded-xl border border-primary/15 bg-background px-4 text-sm font-medium text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>

              {recoveryError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {recoveryError}
                </p>
              )}

              <Button
                type="submit"
                disabled={
                  isRecovering || !recoveryUsername || !newPassword || !recoveryKey
                }
                variant="outline"
                className="h-10 w-full rounded-xl text-xs font-medium uppercase"
              >
                {isRecovering ? 'Resetting...' : 'Reset Password'}
              </Button>
            </form>
          )}

          {recoverySuccess && (
            <p className="rounded-lg bg-positive/10 px-3 py-2 text-xs text-positive">
              {recoverySuccess}
            </p>
          )}
        </div>

        <p className="text-center text-xs text-muted">
          Connecting to{' '}
          <span className="text-foreground">{selectedEndpoint}</span>
        </p>
      </div>
    </div>
  )
}
