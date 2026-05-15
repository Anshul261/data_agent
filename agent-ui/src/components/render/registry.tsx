'use client'

import { defineRegistry } from '@json-render/react'
import ReactECharts from 'echarts-for-react'
import { BarChart3, Database, FileText, LineChart, PieChart } from 'lucide-react'
import { useMemo } from 'react'

import MarkdownRenderer from '@/components/ui/typography/MarkdownRenderer'
import { cn } from '@/lib/utils'
import type { ChartArtifact } from '@/types/os'
import { renderCatalog } from './catalog'

type DataArtifact = {
  data: Array<Record<string, unknown>>
  mapping?: ChartArtifact['mapping']
}

type VisualArtifact = DataArtifact & {
  chart_type: 'line' | 'bar' | 'pie'
  presentation?: ChartArtifact['presentation']
}

const palette = [
  '#38bdf8',
  '#22c55e',
  '#f97316',
  '#eab308',
  '#f43f5e',
  '#a78bfa'
]

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

const formatValue = (value: unknown) => {
  const numeric = toNumber(value)
  if (Math.abs(numeric) >= 1000) {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 1,
      notation: 'compact'
    }).format(numeric)
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2
  }).format(numeric)
}

const getField = (
  artifact: DataArtifact,
  preferred: 'x' | 'y' | 'label' | 'value'
) => {
  const fields = Object.keys(artifact.data[0] ?? {})
  const mapping = artifact.mapping ?? {}

  if (mapping[preferred]) return mapping[preferred]
  if (preferred === 'x' || preferred === 'label') return fields[0]
  if (preferred === 'y' || preferred === 'value') return fields[1] ?? fields[0]
  return fields[0]
}

const buildChartOption = (artifact: VisualArtifact) => {
  const xField = getField(artifact, 'x')
  const yField = getField(artifact, 'y')
  const labelField = getField(artifact, 'label')
  const valueField = getField(artifact, 'value')
  const showLegend =
    artifact.presentation?.show_legend ?? artifact.chart_type === 'pie'
  const showTooltip = artifact.presentation?.show_tooltip ?? true

  const base = {
    backgroundColor: 'transparent',
    color: palette,
    animationDuration: 650,
    textStyle: {
      color: '#d7dde7',
      fontFamily: 'Geist, ui-sans-serif, system-ui'
    },
    tooltip: showTooltip
      ? {
          trigger: artifact.chart_type === 'pie' ? 'item' : 'axis',
          backgroundColor: 'rgba(10, 14, 22, 0.94)',
          borderColor: 'rgba(148, 163, 184, 0.24)',
          textStyle: { color: '#f8fafc' }
        }
      : undefined,
    legend: showLegend
      ? {
          type: 'scroll',
          bottom: 0,
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { color: '#9ca3af', fontSize: 11 }
        }
      : undefined,
    grid: {
      top: 18,
      right: 16,
      bottom: 38,
      left: 42,
      containLabel: true
    }
  }

  if (artifact.chart_type === 'pie') {
    return {
      ...base,
      series: [
        {
          type: 'pie',
          radius: ['48%', '74%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          padAngle: 2,
          itemStyle: { borderColor: '#0b1018', borderWidth: 2 },
          label: {
            color: '#d7dde7',
            formatter: '{b}',
            fontSize: 11,
            overflow: 'truncate',
            width: 96
          },
          data: artifact.data.map((row: Record<string, unknown>) => ({
            name: String(row[labelField] ?? ''),
            value: toNumber(row[valueField])
          }))
        }
      ]
    }
  }

  return {
    ...base,
    dataset: { source: artifact.data },
    xAxis: {
      type: 'category',
      axisLabel: {
        color: '#9ca3af',
        hideOverlap: true
      },
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.22)' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)' } },
      axisLabel: { color: '#9ca3af' }
    },
    series: [
      {
        type: artifact.chart_type,
        encode: { x: xField, y: yField },
        smooth: artifact.chart_type === 'line',
        symbolSize: 7,
        barMaxWidth: 34,
        lineStyle: { width: 3 },
        areaStyle: artifact.chart_type === 'line' ? { opacity: 0.12 } : undefined
      }
    ]
  }
}

const cardClass =
  'overflow-hidden rounded-lg border border-white/10 bg-[#0b1018] text-primary shadow-[0_18px_55px_rgba(0,0,0,0.24)]'

const ChartIcon = ({ type }: { type: ChartArtifact['chart_type'] }) => {
  const Icon =
    type === 'line'
      ? LineChart
      : type === 'pie'
        ? PieChart
        : type === 'table'
          ? FileText
          : type === 'metric'
            ? Database
            : BarChart3

  return <Icon className="h-4 w-4" />
}

export const { registry: renderRegistry } = defineRegistry(renderCatalog, {
  components: {
    Dashboard: ({ props, children }) => (
      <section className="w-full overflow-hidden rounded-xl border border-white/10 bg-[#080c12] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0))] px-5 py-4">
          <h2 className="text-sm font-semibold text-white">{props.title}</h2>
          {props.subtitle && (
            <p className="mt-1 text-xs text-slate-400">{props.subtitle}</p>
          )}
        </div>
        <div className="space-y-4 p-4">{children}</div>
      </section>
    ),
    Report: ({ props, children }) => (
      <article className="w-full rounded-lg border border-white/10 bg-[#080c12] p-6 text-primary shadow-[0_24px_80px_rgba(0,0,0,0.28)] print:border-0 print:bg-white print:text-slate-950 print:shadow-none">
        <header className="mb-6 border-b border-white/10 pb-4 print:border-slate-200">
          <h1 className="text-2xl font-semibold tracking-normal">
            {props.title}
          </h1>
          {props.subtitle && (
            <p className="mt-2 text-sm text-secondary print:text-slate-600">
              {props.subtitle}
            </p>
          )}
          {props.generated_at && (
            <p className="mt-3 text-xs uppercase text-secondary print:text-slate-500">
              Generated {props.generated_at}
            </p>
          )}
        </header>
        <div className="space-y-5">{children}</div>
      </article>
    ),
    Section: ({ props, children }) => (
      <section className="space-y-3">
        {(props.title || props.description) && (
          <div>
            {props.title && (
              <h3 className="text-sm font-semibold text-primary">
                {props.title}
              </h3>
            )}
            {props.description && (
              <p className="mt-1 text-xs text-secondary">{props.description}</p>
            )}
          </div>
        )}
        {children}
      </section>
    ),
    Grid: ({ props, children }) => (
      <div
        className={cn(
          'grid gap-4',
          props.columns === 1 && 'grid-cols-1',
          props.columns === 2 && 'xl:grid-cols-2',
          props.columns === 3 && 'md:grid-cols-2 xl:grid-cols-3',
          props.columns === 4 && 'sm:grid-cols-2 xl:grid-cols-4'
        )}
      >
        {children}
      </div>
    ),
    Card: ({ props, children }) => (
      <section className={cardClass}>
        {(props.title || props.description) && (
          <div className="border-b border-white/10 px-4 py-3">
            {props.title && (
              <h3 className="text-sm font-semibold text-primary">
                {props.title}
              </h3>
            )}
            {props.description && (
              <p className="mt-1 text-xs text-secondary">{props.description}</p>
            )}
          </div>
        )}
        <div className="p-4">{children}</div>
      </section>
    ),
    Metric: ({ props }) => {
      const row = props.data[0] ?? {}
      const labelField = getField(props, 'label')
      const valueField = getField(props, 'value')
      const label = row[labelField] ? String(row[labelField]) : props.title

      return (
        <section data-dashboard-card="true" className={cardClass}>
          <div className="p-4">
            <p className="truncate text-xs font-medium uppercase text-slate-400">
              {label}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-normal text-white">
              {formatValue(row[valueField])}
            </p>
            {props.insight && (
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">
                {props.insight}
              </p>
            )}
          </div>
        </section>
      )
    },
    EChart: ({ props }) => {
      const option = useMemo(() => buildChartOption(props), [props])

      return (
        <section data-dashboard-card="true" className={cardClass}>
          <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0))] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-sky-100">
                  <ChartIcon type={props.chart_type} />
                </span>
                <h3 className="truncate text-sm font-semibold text-primary">
                  {props.title}
                </h3>
              </div>
              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] uppercase text-secondary">
                {props.chart_type}
              </span>
            </div>
            {props.insight && (
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-secondary">
                {props.insight}
              </p>
            )}
          </div>
          <div className="p-4">
            <ReactECharts
              className="h-72 w-full"
              option={option}
              opts={{ renderer: 'svg' }}
              notMerge
              lazyUpdate
            />
          </div>
        </section>
      )
    },
    DataTable: ({ props }) => {
      const fields = Object.keys(props.data[0] ?? {})

      return (
        <section data-dashboard-card="true" className={cardClass}>
          <div className="border-b border-white/10 px-4 py-3">
            <h3 className="text-sm font-semibold text-primary">{props.title}</h3>
            {props.insight && (
              <p className="mt-1 text-xs text-secondary">{props.insight}</p>
            )}
          </div>
          <div className="max-h-96 overflow-auto p-4">
            <table className="w-full min-w-full border-collapse">
              <thead className="sticky top-0 bg-[#0b1018]">
                <tr>
                  {fields.map((field) => (
                    <th
                      key={field}
                      className="border-b border-primary/10 px-3 py-2 text-left text-xs uppercase text-secondary"
                    >
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {props.data.map((row, index) => (
                  <tr key={index} className="odd:bg-primary/[0.02]">
                    {fields.map((field) => (
                      <td
                        key={field}
                        className="border-b border-primary/5 px-3 py-2 text-xs text-primary/85"
                      >
                        {String(row[field] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )
    },
    Insight: ({ props }) => (
      <p className="rounded-lg border border-sky-300/15 bg-sky-300/[0.06] p-3 text-sm leading-6 text-slate-200 print:border-slate-200 print:bg-slate-50 print:text-slate-700">
        {props.text}
      </p>
    ),
    MarkdownText: ({ props }) => <MarkdownRenderer>{props.content}</MarkdownRenderer>,
    Divider: () => <hr className="border-white/10 print:border-slate-200" />,
    PageBreak: () => <div className="break-after-page" />
  }
})
