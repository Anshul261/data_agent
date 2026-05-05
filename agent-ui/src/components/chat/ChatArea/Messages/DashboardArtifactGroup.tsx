'use client'

import { useMemo } from 'react'
import { Download, LayoutDashboard } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ChartArtifact } from '@/types/os'
import ChartArtifactCard from './ChartArtifactCard'

const DashboardArtifactGroup = ({
  artifacts
}: {
  artifacts: ChartArtifact[]
}) => {
  const dashboardId = useMemo(
    () =>
      `dashboard-${artifacts
        .map((artifact) => artifact.artifact_id ?? artifact.title)
        .join('-')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .slice(0, 80)}`,
    [artifacts]
  )
  const metrics = artifacts.filter(
    (artifact) => artifact.chart_type === 'metric'
  )
  const charts = artifacts.filter(
    (artifact) => artifact.chart_type !== 'metric'
  )

  if (artifacts.length === 1) {
    return <ChartArtifactCard artifact={artifacts[0]} />
  }

  const handlePrint = () => {
    const previousTitle = document.title
    const currentDashboard = document.getElementById(dashboardId)

    if (!currentDashboard) return

    const previousPrintRoot = document.getElementById('dashboard-print-root')
    previousPrintRoot?.remove()

    const printRoot = document.createElement('div')
    printRoot.id = 'dashboard-print-root'
    printRoot.appendChild(currentDashboard.cloneNode(true))
    document.body.appendChild(printRoot)
    document.body.setAttribute('data-printing-dashboard', 'true')
    document.title = 'Dashboard Export'

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
    <section
      id={dashboardId}
      className="w-full overflow-hidden rounded-xl border border-white/10 bg-[#080c12] shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0))] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-sky-100">
              <LayoutDashboard className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Dashboard View
              </h2>
              <p className="text-xs text-slate-400">
                {artifacts.length} live artifacts from this response
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase text-slate-400">
              Interactive
            </span>
            <Button
              className="h-8 border-white/10 bg-white/[0.04] px-3 text-xs text-slate-200 hover:bg-white/[0.08] hover:text-white"
              type="button"
              variant="outline"
              onClick={handlePrint}
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {metrics.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((artifact, index) => (
              <ChartArtifactCard
                key={`${artifact.artifact_id ?? artifact.title}-${index}`}
                artifact={artifact}
                variant="dashboard"
              />
            ))}
          </div>
        )}

        {charts.length > 0 && (
          <div className="grid gap-4 xl:grid-cols-2">
            {charts.map((artifact, index) => (
              <div
                key={`${artifact.artifact_id ?? artifact.title}-${index}`}
                className={
                  artifact.chart_type === 'line' && charts.length > 1
                    ? 'xl:col-span-2'
                    : undefined
                }
              >
                <ChartArtifactCard artifact={artifact} variant="dashboard" />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default DashboardArtifactGroup
