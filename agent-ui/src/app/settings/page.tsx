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

const ENDPOINT_PLACEHOLDER = 'NO ENDPOINT ADDED'

export default function SettingsPage() {
  const router = useRouter()
  const {
    selectedEndpoint,
    isEndpointActive,
    setSelectedEndpoint,
    setAgents,
    setSessionsData,
    setMessages,
    authToken,
    setAuthToken
  } = useStore()
  const { initialize } = useChatActions()

  // Endpoint state
  const [isEditingEndpoint, setIsEditingEndpoint] = useState(false)
  const [endpointValue, setEndpointValue] = useState('')
  const [isEndpointHovering, setIsEndpointHovering] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [, setAgentId] = useQueryState('agent')
  const [, setSessionId] = useQueryState('session')

  // Auth Token state
  const [isEditingToken, setIsEditingToken] = useState(false)
  const [tokenValue, setTokenValue] = useState('')
  const [isTokenHovering, setIsTokenHovering] = useState(false)

  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setEndpointValue(selectedEndpoint)
    setTokenValue(authToken)
    setIsMounted(true)
  }, [selectedEndpoint, authToken])

  const getStatusColor = (isActive: boolean) =>
    isActive ? 'bg-positive' : 'bg-destructive'

  // Endpoint handlers
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

  // Auth Token handlers
  const handleSaveToken = () => {
    const cleanToken = tokenValue.trim()
    setAuthToken(cleanToken)
    setIsEditingToken(false)
    setIsTokenHovering(false)
    toast.success('Auth token updated')
  }

  const handleCancelToken = () => {
    setTokenValue(authToken)
    setIsEditingToken(false)
    setIsTokenHovering(false)
  }

  const handleTokenKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveToken()
    } else if (e.key === 'Escape') {
      handleCancelToken()
    }
  }

  const handleClearToken = () => {
    setAuthToken('')
    setTokenValue('')
    toast.success('Auth token cleared')
  }

  const displayTokenValue = authToken
    ? `${'*'.repeat(Math.min(authToken.length, 20))}${authToken.length > 20 ? '...' : ''}`
    : 'NO TOKEN SET'

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
            <p className="text-sm text-muted">
              Configure your API connection and authentication
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* API Endpoint Section */}
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

          {/* Auth Token Section */}
          <div className="space-y-4 rounded-xl border border-primary/15 bg-accent/30 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-foreground">
                  Authentication Token
                </h2>
                <p className="text-sm text-muted">
                  Optional bearer token for API authentication
                </p>
              </div>
            </div>

            {isEditingToken ? (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={tokenValue}
                  onChange={(e) => setTokenValue(e.target.value)}
                  onKeyDown={handleTokenKeyDown}
                  placeholder="Enter authentication token..."
                  className="flex h-11 w-full items-center rounded-xl border border-primary/15 bg-background px-4 text-sm font-medium text-foreground placeholder:text-muted/50"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSaveToken}
                  className="hover:bg-accent"
                  title="Save"
                >
                  <Icon type="save" size="sm" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancelToken}
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
                  onMouseEnter={() => setIsTokenHovering(true)}
                  onMouseLeave={() => setIsTokenHovering(false)}
                  onClick={() => setIsEditingToken(true)}
                  whileHover={{ scale: 1.01 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                >
                  <AnimatePresence mode="wait">
                    {isTokenHovering ? (
                      <motion.div
                        key="token-hover"
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
                        key="token-value"
                        className="text-sm font-medium text-foreground"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {isMounted ? displayTokenValue : 'NO TOKEN SET'}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
                {authToken && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearToken}
                    className="hover:bg-accent"
                    title="Clear token"
                  >
                    <Icon type="trash" size="sm" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
