'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  MessageSquare,
  RefreshCw,
  Settings
} from 'lucide-react'
import { toast } from 'sonner'

import {
  getDashboardAPI,
  listDashboardsAPI,
  refreshDashboardAPI
} from '@/api/os'
import DashboardArtifactGroup from '@/components/chat/ChatArea/Messages/DashboardArtifactGroup'
import JsonRenderArtifactGroup from '@/components/render/JsonRenderArtifactGroup'
import { Button } from '@/components/ui/button'
import { useAuthGuard } from '@/hooks/useAuthGuard'
import {
  hydrateJsonRenderArtifactCards,
  isJsonRenderLayoutArtifact
} from '@/lib/renderArtifacts'
import { useStore } from '@/store'
import type { ChartArtifact, JsonRenderArtifact, SavedDashboard } from '@/types/os'
import { cn } from '@/lib/utils'

const dashboardToArtifacts = (dashboard: SavedDashboard): ChartArtifact[] =>
  (dashboard.cards ?? []).map((card) => ({
    kind: 'chart_artifact',
    version: 1,
    artifact_id: card.id,
    title: card.title,
    chart_type: card.chart_type,
    data: card.last_result ?? [],
    mapping: card.mapping,
    query: {
      sql: card.sql,
      explanation: undefined
    },
    insight: card.last_error
      ? `Refresh error: ${card.last_error}`
      : (card.insight ?? undefined),
    presentation: card.presentation
  }))

const dashboardToRenderArtifact = (
  dashboard: SavedDashboard
): JsonRenderArtifact | null => {
  const layoutArtifact = dashboard.layout.find(isJsonRenderLayoutArtifact)
  if (!layoutArtifact) return null

  return hydrateJsonRenderArtifactCards(
    layoutArtifact,
    dashboardToArtifacts(dashboard)
  )
}

const DashboardPageContent = () => {
  const { isAuthenticated } = useAuthGuard()
  const selectedEndpoint = useStore((state) => state.selectedEndpoint)
  const authToken = useStore((state) => state.authToken)
  const [dashboards, setDashboards] = useState<SavedDashboard[]>([])
  const [selectedDashboard, setSelectedDashboard] =
    useState<SavedDashboard | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isNavCollapsed, setIsNavCollapsed] = useState(false)
  const [isListCollapsed, setIsListCollapsed] = useState(false)

  const loadDashboards = useCallback(async () => {
    if (!authToken) return

    try {
      setIsLoading(true)
      const items = await listDashboardsAPI(selectedEndpoint, authToken)
      setDashboards(items)

      if (!selectedDashboard && items[0]) {
        const detail = await getDashboardAPI(
          selectedEndpoint,
          authToken,
          items[0].id
        )
        setSelectedDashboard(detail)
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load dashboards'
      )
    } finally {
      setIsLoading(false)
    }
  }, [authToken, selectedDashboard, selectedEndpoint])

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboards()
    }
  }, [isAuthenticated, loadDashboards])

  const artifacts = useMemo(
    () => (selectedDashboard ? dashboardToArtifacts(selectedDashboard) : []),
    [selectedDashboard]
  )
  const renderArtifact = useMemo(
    () =>
      selectedDashboard ? dashboardToRenderArtifact(selectedDashboard) : null,
    [selectedDashboard]
  )

  const handleSelectDashboard = async (dashboardId: string) => {
    try {
      const detail = await getDashboardAPI(
        selectedEndpoint,
        authToken,
        dashboardId
      )
      setSelectedDashboard(detail)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load dashboard'
      )
    }
  }

  const handleRefresh = async () => {
    if (!selectedDashboard) return

    try {
      setIsRefreshing(true)
      const refreshed = await refreshDashboardAPI(
        selectedEndpoint,
        authToken,
        selectedDashboard.id
      )
      setSelectedDashboard(refreshed)
      await loadDashboards()
      toast.success('Dashboard refreshed')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to refresh dashboard'
      )
    } finally {
      setIsRefreshing(false)
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen bg-background/80">
      <aside
        className={cn(
          'relative flex h-screen shrink-0 flex-col border-r border-border/60 bg-background-secondary/30 p-3 font-dmmono transition-[width] duration-300',
          isNavCollapsed ? 'w-12' : 'w-64'
        )}
      >
        <Button
          aria-label={
            isNavCollapsed ? 'Expand navigation' : 'Collapse navigation'
          }
          className="absolute right-2 top-2 h-6 w-6"
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => setIsNavCollapsed((value) => !value)}
        >
          {isNavCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
        <div
          className={cn(
            'flex items-center gap-2 px-2 py-2',
            isNavCollapsed && 'justify-center px-0 pt-8'
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0 text-primary" />
          {!isNavCollapsed && (
            <span className="text-xs font-medium uppercase text-white">
              Dashboards
            </span>
          )}
        </div>

        <nav className="mt-4 space-y-2">
          <Link
            href="/"
            className={cn(
              'flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium uppercase text-secondary hover:bg-accent hover:text-primary',
              isNavCollapsed && 'justify-center px-0'
            )}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            {!isNavCollapsed && 'Chat'}
          </Link>
          <Link
            href="/settings"
            className={cn(
              'flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium uppercase text-secondary hover:bg-accent hover:text-primary',
              isNavCollapsed && 'justify-center px-0'
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {!isNavCollapsed && 'Settings'}
          </Link>
        </nav>
      </aside>
      <main className="m-1.5 flex min-w-0 flex-1 overflow-hidden rounded-xl bg-background">
        <aside
          className={cn(
            'relative hidden shrink-0 border-r border-border/60 bg-background-secondary/30 transition-[width] duration-300 lg:block',
            isListCollapsed ? 'w-12 p-2' : 'w-80 p-4'
          )}
        >
          <Button
            aria-label={
              isListCollapsed
                ? 'Expand dashboard list'
                : 'Collapse dashboard list'
            }
            className="absolute right-2 top-3 h-6 w-6"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setIsListCollapsed((value) => !value)}
          >
            {isListCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>

          {isListCollapsed ? (
            <div className="mt-10 flex justify-center">
              <LayoutDashboard className="h-4 w-4 text-primary" />
            </div>
          ) : (
            <>
              <div className="mb-4 pr-8">
                <h1 className="text-sm font-semibold text-primary">
                  Saved Dashboards
                </h1>
                <p className="mt-1 text-xs text-secondary">
                  Rerunnable dashboards saved to your account.
                </p>
              </div>

              <div className="space-y-2">
                {dashboards.map((dashboard) => (
                  <button
                    key={dashboard.id}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors',
                      selectedDashboard?.id === dashboard.id
                        ? 'border-primary/40 bg-accent'
                        : 'border-border/60 bg-background hover:bg-accent/60'
                    )}
                    type="button"
                    onClick={() => handleSelectDashboard(dashboard.id)}
                  >
                    <p className="truncate text-sm font-medium text-primary">
                      {dashboard.name}
                    </p>
                    <p className="mt-1 text-xs text-secondary">
                      {dashboard.card_count ?? dashboard.cards?.length ?? 0}{' '}
                      cards
                    </p>
                  </button>
                ))}

                {!isLoading && dashboards.length === 0 && (
                  <div className="rounded-lg border border-border/60 p-4 text-xs text-secondary">
                    No saved dashboards yet.
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-primary">
                {selectedDashboard?.name ?? 'Saved Dashboards'}
              </h2>
              {selectedDashboard?.updated_at && (
                <p className="mt-1 text-xs text-secondary">
                  Last updated{' '}
                  {new Date(selectedDashboard.updated_at).toLocaleString()}
                </p>
              )}
            </div>

            <Button
              disabled={!selectedDashboard || isRefreshing}
              type="button"
              variant="outline"
              onClick={handleRefresh}
            >
              <RefreshCw
                className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
              />
              Refresh queries
            </Button>
          </div>

          {selectedDashboard && renderArtifact ? (
            <JsonRenderArtifactGroup
              artifact={renderArtifact}
              showSave={false}
            />
          ) : selectedDashboard && artifacts.length > 0 ? (
            <DashboardArtifactGroup artifacts={artifacts} showSave={false} />
          ) : (
            <div className="flex h-[60vh] items-center justify-center rounded-xl border border-border/60 bg-background-secondary/20 text-sm text-secondary">
              Select a dashboard to view it.
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default function DashboardsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardPageContent />
    </Suspense>
  )
}
