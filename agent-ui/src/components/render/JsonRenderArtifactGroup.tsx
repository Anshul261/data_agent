'use client'

import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider
} from '@json-render/react'
import { Download, Save } from 'lucide-react'
import { useMemo } from 'react'
import { useQueryState } from 'nuqs'
import { toast } from 'sonner'

import { createDashboardAPI } from '@/api/os'
import { Button } from '@/components/ui/button'
import { cardsFromJsonRenderArtifact } from '@/lib/renderArtifacts'
import { useStore } from '@/store'
import type { JsonRenderArtifact } from '@/types/os'
import { renderRegistry } from './registry'

const JsonRenderArtifactGroup = ({
  artifact,
  showSave = true
}: {
  artifact: JsonRenderArtifact
  showSave?: boolean
}) => {
  const selectedEndpoint = useStore((state) => state.selectedEndpoint)
  const authToken = useStore((state) => state.authToken)
  const [sessionId] = useQueryState('session')
  const renderId = useMemo(
    () =>
      `json-render-${(artifact.artifact_id ?? artifact.title)
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .slice(0, 80)}`,
    [artifact.artifact_id, artifact.title]
  )

  const handleSave = async () => {
    const cards = cardsFromJsonRenderArtifact(artifact)
      .map((card, index) => ({
        title: card.title,
        chart_type: card.chart_type,
        sql: card.query?.sql?.trim() ?? '',
        mapping: card.mapping,
        presentation: card.presentation,
        insight: card.insight,
        last_result: card.data,
        position: { order: index }
      }))
      .filter((card) => card.sql)

    if (cards.length === 0) {
      toast.error('This render artifact does not include rerunnable SQL cards.')
      return
    }

    const sourceCards = cardsFromJsonRenderArtifact(artifact)
    if (cards.length !== sourceCards.length) {
      toast.error('Every saved dashboard/report card needs SQL before refresh.')
      return
    }

    const name = window.prompt('Dashboard/report name', artifact.title)
    if (!name) return

    try {
      await createDashboardAPI(selectedEndpoint, authToken, {
        name,
        source_session_id: sessionId,
        layout: [artifact],
        cards
      })
      toast.success('Dashboard/report saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    }
  }

  const handlePrint = () => {
    const previousTitle = document.title
    const currentRender = document.getElementById(renderId)

    if (!currentRender) return

    const previousPrintRoot = document.getElementById('dashboard-print-root')
    previousPrintRoot?.remove()

    const printRoot = document.createElement('div')
    printRoot.id = 'dashboard-print-root'
    printRoot.appendChild(currentRender.cloneNode(true))
    document.body.appendChild(printRoot)
    document.body.setAttribute('data-printing-dashboard', 'true')
    document.title = artifact.title

    const cleanup = () => {
      document.body.removeAttribute('data-printing-dashboard')
      printRoot.remove()
      document.title = previousTitle
      window.removeEventListener('afterprint', cleanup)
    }

    window.addEventListener('afterprint', cleanup)

    requestAnimationFrame(() => {
      window.print()
      window.setTimeout(cleanup, 1000)
    })
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex justify-end gap-2 print:hidden">
        {showSave && (
          <Button
            className="h-8 px-3 text-xs"
            type="button"
            variant="outline"
            onClick={handleSave}
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        )}
        <Button
          className="h-8 px-3 text-xs"
          type="button"
          variant="outline"
          onClick={handlePrint}
        >
          <Download className="h-3.5 w-3.5" />
          PDF
        </Button>
      </div>
      <div id={renderId}>
        <StateProvider initialState={artifact.spec.state ?? {}}>
          <VisibilityProvider>
            <ActionProvider handlers={{}}>
              <Renderer spec={artifact.spec} registry={renderRegistry} />
            </ActionProvider>
          </VisibilityProvider>
        </StateProvider>
      </div>
    </div>
  )
}

export default JsonRenderArtifactGroup
