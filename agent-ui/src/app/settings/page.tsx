'use client'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import Icon from '@/components/ui/icon'
import { isValidUrl } from '@/lib/utils'
import { toast } from 'sonner'
import { useQueryState } from 'nuqs'
import { truncateText } from '@/lib/utils'
import useChatActions from '@/hooks/useChatActions'
import { useRouter } from 'next/navigation'
import { APIRoutes } from '@/api/routes'
import { useAuthGuard } from '@/hooks/useAuthGuard'

const ENDPOINT_PLACEHOLDER = 'NO ENDPOINT ADDED'

export default function SettingsPage() {
  const router = useRouter()
  useAuthGuard()

  const {
    selectedEndpoint,
    isEndpointActive,
    setSelectedEndpoint,
    setAgents,
    setSessionsData,
    setMessages,
    authToken,
    username,
    userRole,
    logout
  } = useStore()
  const { initialize } = useChatActions()

  const [isEditingEndpoint, setIsEditingEndpoint] = useState(false)
  const [endpointValue, setEndpointValue] = useState('')
  const [isEndpointHovering, setIsEndpointHovering] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [, setAgentId] = useQueryState('agent')
  const [, setSessionId] = useQueryState('session')

  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(false)
  const [isDeletingKnowledge, setIsDeletingKnowledge] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setEndpointValue(selectedEndpoint)
    setIsMounted(true)
  }, [selectedEndpoint])

  const getStatusColor = (isActive: boolean) =>
    isActive ? 'bg-positive' : 'bg-destructive'

  const handleSaveEndpoint = async () => {
    if (!isValidUrl(endpointValue)) {
      toast.error('Please enter a valid URL')
      return
    }
    const cleanEndpoint = endpointValue.replace(/\/$/, '').trim()
    setSelectedEndpoint(cleanEndpoint)
    setAgentId(null)
    setSessionId(null)
    setIsEditingEndpoint(false)
    setIsEndpointHovering(false)
    setAgents([])
    setSessionsData([])
    setMessages([])
    toast.success('API Endpoint updated')
  }

  const handleCancelEndpoint = () => {
    setEndpointValue(selectedEndpoint)
    setIsEditingEndpoint(false)
    setIsEndpointHovering(false)
  }

  const handleEndpointKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveEndpoint()
    } else if (e.key === 'Escape') {
      handleCancelEndpoint()
    }
  }

  const handleRefresh = async () => {
    setIsRotating(true)
    await initialize()
    setTimeout(() => setIsRotating(false), 500)
    toast.success('Connection refreshed')
  }

  const handleLogout = () => {
    logout()
    router.replace('/login')
  }

  const handleLoadKnowledge = async () => {
    if (!selectedEndpoint) {
      toast.error('No endpoint configured')
      return
    }
    setIsLoadingKnowledge(true)
    try {
      const response = await fetch(APIRoutes.LoadKnowledge(selectedEndpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        }
      })
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const data = await response.json()
      if (data.errors && data.errors.length > 0) {
        toast.error(`Loaded ${data.loaded} files, ${data.errors.length} errors`)
      } else if (data.skipped > 0 && data.loaded === 0) {
        toast.info(`All ${data.total} files already loaded (skipped)`)
      } else {
        toast.success(`Loaded ${data.loaded} of ${data.total} knowledge files`)
      }
    } catch (error) {
      toast.error('Failed to load knowledge base')
      console.error('Error loading knowledge:', error)
    } finally {
      setIsLoadingKnowledge(false)
    }
  }

  const handleClearKnowledge = async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }
    setIsDeletingKnowledge(true)
    setConfirmClear(false)
    try {
      const response = await fetch(`${selectedEndpoint}/api/knowledge`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      toast.success('Knowledge base cleared')
    } catch (error) {
      toast.error('Failed to clear knowledge base')
      console.error('Error clearing knowledge:', error)
    } finally {
      setIsDeletingKnowledge(false)
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background font-dmmono">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-primary/15 px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="hover:bg-accent"
          >
            <Icon type="arrow-left" size="sm" />
          </Button>
          <div>
            <h1 className="text-xl font-medium text-foreground">Settings</h1>
            <p className="text-sm text-muted">Configure your API connection</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">

          {/* User Info */}
          <div className="flex items-center justify-between rounded-xl border border-primary/15 bg-accent/30 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-medium uppercase text-primary">
                {username ? username[0] : '?'}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {username || 'Unknown user'}
                </p>
                {userRole && (
                  <span
                    className={`text-xs font-medium ${
                      userRole === 'admin' ? 'text-primary' : 'text-muted'
                    }`}
                  >
                    {userRole}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="flex items-center gap-2 text-xs text-muted hover:text-destructive"
            >
              <Icon type="x" size="xs" />
              Logout
            </Button>
          </div>

          {/* API Endpoint */}
          <div className="space-y-4 rounded-xl border border-primary/15 bg-accent/30 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-foreground">
                  API Endpoint
                </h2>
                <p className="text-sm text-muted">
                  Configure the backend server URL
                </p>
              </div>
              <div
                className={`size-3 shrink-0 rounded-full ${getStatusColor(isEndpointActive)}`}
                title={isEndpointActive ? 'Connected' : 'Disconnected'}
              />
            </div>

            {isEditingEndpoint ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={endpointValue}
                  onChange={(e) => setEndpointValue(e.target.value)}
                  onKeyDown={handleEndpointKeyDown}
                  placeholder="https://api.example.com"
                  className="flex h-11 w-full items-center rounded-xl border border-primary/15 bg-background px-4 text-sm font-medium text-foreground placeholder:text-muted/50"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSaveEndpoint}
                  className="hover:bg-accent"
                  title="Save"
                >
                  <Icon type="save" size="sm" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancelEndpoint}
                  className="hover:bg-accent"
                  title="Cancel"
                >
                  <Icon type="x" size="sm" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <motion.div
                  className="relative flex h-11 w-full cursor-pointer items-center justify-between rounded-xl border border-primary/15 bg-background px-4"
                  onMouseEnter={() => setIsEndpointHovering(true)}
                  onMouseLeave={() => setIsEndpointHovering(false)}
                  onClick={() => setIsEditingEndpoint(true)}
                  whileHover={{ scale: 1.01 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                >
                  <AnimatePresence mode="wait">
                    {isEndpointHovering ? (
                      <motion.div
                        key="endpoint-hover"
                        className="absolute inset-0 flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <p className="flex items-center gap-2 text-sm font-medium text-primary">
                          <Icon type="edit" size="xs" /> Click to edit
                        </p>
                      </motion.div>
                    ) : (
                      <motion.p
                        key="endpoint-value"
                        className="text-sm font-medium text-foreground"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {isMounted
                          ? truncateText(selectedEndpoint, 50) ||
                            ENDPOINT_PLACEHOLDER
                          : 'http://localhost:7777'}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefresh}
                  className="hover:bg-accent"
                  title="Refresh connection"
                >
                  <motion.div
                    animate={{ rotate: isRotating ? 360 : 0 }}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                  >
                    <Icon type="refresh" size="sm" />
                  </motion.div>
                </Button>
              </div>
            )}
          </div>

          {/* Knowledge Base — admin only */}
          {userRole === 'admin' && (
            <div className="space-y-4 rounded-xl border border-primary/15 bg-accent/30 p-6">
              <div>
                <h2 className="text-lg font-medium text-foreground">
                  Knowledge Base
                </h2>
                <p className="text-sm text-muted">
                  Load table schemas, queries, and business rules into the
                  vector database
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleLoadKnowledge}
                  disabled={
                    isLoadingKnowledge ||
                    isDeletingKnowledge ||
                    !selectedEndpoint
                  }
                  className="flex items-center gap-2"
                >
                  {isLoadingKnowledge ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: 'linear'
                      }}
                    >
                      <Icon type="refresh" size="sm" />
                    </motion.div>
                  ) : (
                    <Icon type="download" size="sm" />
                  )}
                  Load Knowledge
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleClearKnowledge}
                  disabled={
                    isLoadingKnowledge ||
                    isDeletingKnowledge ||
                    !selectedEndpoint
                  }
                  className={`flex items-center gap-2 transition-colors ${
                    confirmClear
                      ? 'border border-destructive text-destructive hover:bg-destructive/10'
                      : 'text-muted hover:text-destructive'
                  }`}
                  onBlur={() => setConfirmClear(false)}
                >
                  {isDeletingKnowledge ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: 'linear'
                      }}
                    >
                      <Icon type="refresh" size="sm" />
                    </motion.div>
                  ) : (
                    <Icon type="trash" size="sm" />
                  )}
                  {confirmClear ? 'Confirm Clear?' : 'Clear KB'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
