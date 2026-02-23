'use client'
import { Button } from '@/components/ui/button'
import { ModeSelector } from '@/components/chat/Sidebar/ModeSelector'
import { EntitySelector } from '@/components/chat/Sidebar/EntitySelector'
import useChatActions from '@/hooks/useChatActions'
import { useStore } from '@/store'
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import Icon from '@/components/ui/icon'
import { getProviderIcon } from '@/lib/modelProvider'
import Sessions from './Sessions'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { useQueryState } from 'nuqs'
import { useRouter } from 'next/navigation'

const SidebarHeader = () => (
  <div className="flex items-center gap-2">
    <Icon type="agent" size="xs" />
    <span className="text-xs font-medium uppercase text-white">Data Agent</span>
  </div>
)

const SettingsButton = () => (
  <Link href="/settings" className="w-full">
    <Button
      variant="ghost"
      className="h-9 w-full justify-start gap-2 rounded-xl hover:bg-accent"
      title="Settings"
    >
      <Icon type="settings" size="xs" />
      <span className="text-xs font-medium uppercase">Settings</span>
    </Button>
  </Link>
)

const UserFooter = ({
  username,
  userRole,
  onLogout
}: {
  username: string
  userRole: 'admin' | 'user' | null
  onLogout: () => void
}) => (
  <div className="flex items-center justify-between rounded-xl border border-primary/15 bg-accent/30 px-3 py-2">
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium uppercase text-primary">
        {username[0]}
      </div>
      <span className="truncate text-xs font-medium text-foreground">
        {username}
      </span>
      {userRole && (
        <span
          className={`shrink-0 rounded px-1 py-0.5 text-xs ${
            userRole === 'admin'
              ? 'bg-primary/20 text-primary'
              : 'bg-accent text-muted'
          }`}
        >
          {userRole}
        </span>
      )}
    </div>
    <Button
      variant="ghost"
      size="icon"
      onClick={onLogout}
      className="h-6 w-6 shrink-0 hover:text-destructive"
      title="Logout"
    >
      <Icon type="x" size="xs" />
    </Button>
  </div>
)

const NewChatButton = ({
  disabled,
  onClick
}: {
  disabled: boolean
  onClick: () => void
}) => (
  <Button
    onClick={onClick}
    disabled={disabled}
    size="lg"
    className="h-9 w-full rounded-xl bg-primary text-xs font-medium text-background hover:bg-primary/80"
  >
    <Icon type="plus-icon" size="xs" className="text-background" />
    <span className="uppercase">New Chat</span>
  </Button>
)

const ModelDisplay = ({ model }: { model: string }) => (
  <div className="flex h-9 w-full items-center gap-3 rounded-xl border border-primary/15 bg-accent p-3 text-xs font-medium uppercase text-muted">
    {(() => {
      const icon = getProviderIcon(model)
      return icon ? <Icon type={icon} className="shrink-0" size="xs" /> : null
    })()}
    {model}
  </div>
)

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const router = useRouter()
  const { clearChat, focusChatInput, initialize } = useChatActions()
  const {
    messages,
    selectedEndpoint,
    isEndpointActive,
    selectedModel,
    hydrated,
    isEndpointLoading,
    mode,
    username,
    userRole,
    logout
  } = useStore()

  const handleLogout = () => {
    logout()
    router.replace('/login')
  }
  const [isMounted, setIsMounted] = useState(false)
  const [agentId] = useQueryState('agent')
  const [teamId] = useQueryState('team')

  useEffect(() => {
    setIsMounted(true)

    if (hydrated) initialize()
  }, [selectedEndpoint, initialize, hydrated, mode])

  const handleNewChat = () => {
    clearChat()
    focusChatInput()
  }

  return (
    <motion.aside
      className="relative flex h-screen shrink-0 grow-0 flex-col overflow-hidden px-2 py-3 font-dmmono"
      initial={{ width: '16rem' }}
      animate={{ width: isCollapsed ? '2.5rem' : '16rem' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <motion.button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute right-2 top-2 z-10 p-1"
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        type="button"
        whileTap={{ scale: 0.95 }}
      >
        <Icon
          type="sheet"
          size="xs"
          className={`transform ${isCollapsed ? 'rotate-180' : 'rotate-0'}`}
        />
      </motion.button>
      <motion.div
        className="flex h-full w-60 flex-col"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: isCollapsed ? 0 : 1, x: isCollapsed ? -20 : 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{
          pointerEvents: isCollapsed ? 'none' : 'auto'
        }}
      >
        <div className="flex flex-1 flex-col space-y-5 overflow-y-auto">
          <SidebarHeader />
          <NewChatButton
            disabled={messages.length === 0}
            onClick={handleNewChat}
          />
          {isMounted && isEndpointActive && (
            <>
              <motion.div
                className="flex w-full flex-col items-start gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
              >
                <div className="text-xs font-medium uppercase text-primary">
                  Mode
                </div>
                {isEndpointLoading ? (
                  <div className="flex w-full flex-col gap-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton
                        key={index}
                        className="h-9 w-full rounded-xl"
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    <ModeSelector />
                    <EntitySelector />
                    {selectedModel && (agentId || teamId) && (
                      <ModelDisplay model={selectedModel} />
                    )}
                  </>
                )}
              </motion.div>
              <Sessions />
            </>
          )}
        </div>
        <div className="mt-auto space-y-2 border-t border-primary/15 pt-3">
          {username && (
            <UserFooter
              username={username}
              userRole={userRole}
              onLogout={handleLogout}
            />
          )}
          <SettingsButton />
        </div>
      </motion.div>
    </motion.aside>
  )
}

export default Sidebar
