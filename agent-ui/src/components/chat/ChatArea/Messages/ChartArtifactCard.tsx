'use client'

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  BarChart3,
  Database,
  LineChart,
  PieChart,
  Table2,
  TrendingUp
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ChartArtifact } from '@/types/os'

const palette = [
  '#38bdf8',
  '#22c55e',
  '#f97316',
  '#eab308',
  '#f43f5e',
  '#a78bfa'
]

const getField = (
  artifact: ChartArtifact,
  preferred: 'x' | 'y' | 'label' | 'value'
) => {
  const fields = Object.keys(artifact.data[0] ?? {})
  const mapping = artifact.mapping ?? {}

  if (mapping[preferred]) return mapping[preferred]
  if (preferred === 'x' || preferred === 'label') return fields[0]
  if (preferred === 'y' || preferred === 'value') return fields[1] ?? fields[0]
  return fields[0]
}

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

const buildChartOption = (artifact: ChartArtifact) => {
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
          data: artifact.data.map((row) => ({
            name: String(row[labelField] ?? ''),
            value: toNumber(row[valueField])
          }))
        }
      ]
    }
  }

  return {
    ...base,
    dataset: {
      source: artifact.data
    },
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
        areaStyle:
          artifact.chart_type === 'line'
            ? {
                opacity: 0.12
              }
            : undefined
      }
    ]
  }
}

const chartIcon = {
  bar: BarChart3,
  line: LineChart,
  metric: Database,
  pie: PieChart,
  table: Table2
}

const MetricArtifact = ({ artifact }: { artifact: ChartArtifact }) => {
  const valueField = getField(artifact, 'value')
  const labelField = getField(artifact, 'label')
  const row = artifact.data[0] ?? {}
  const label = row[labelField] ? String(row[labelField]) : artifact.title

  return (
    <div className="rounded-lg border border-primary/10 bg-background-secondary/50 p-4">
      <p className="text-xs uppercase text-secondary">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-normal text-primary">
        {formatValue(row[valueField])}
      </p>
    </div>
  )
}

const DashboardMetricArtifact = ({ artifact }: { artifact: ChartArtifact }) => {
  const valueField = getField(artifact, 'value')
  const labelField = getField(artifact, 'label')
  const row = artifact.data[0] ?? {}
  const label = row[labelField] ? String(row[labelField]) : artifact.title

  return (
    <section
      data-dashboard-card="true"
      className="relative overflow-hidden rounded-lg border border-white/10 bg-[#101722] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.18)]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase text-slate-400">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-normal text-white">
            {formatValue(row[valueField])}
          </p>
        </div>
        <span className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-sky-200">
          <TrendingUp className="h-4 w-4" />
        </span>
      </div>
      {artifact.insight && (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">
          {artifact.insight}
        </p>
      )}
    </section>
  )
}

const TableArtifact = ({ artifact }: { artifact: ChartArtifact }) => {
  const fields = Object.keys(artifact.data[0] ?? {})

  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-primary/10">
      <table className="w-full min-w-full border-collapse">
        <thead className="sticky top-0 bg-background">
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
          {artifact.data.map((row, index) => (
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
  )
}

const EChart = ({ artifact }: { artifact: ChartArtifact }) => {
  const option = useMemo(() => buildChartOption(artifact), [artifact])

  return (
    <div className="dashboard-chart-frame">
      <ReactECharts
        className="h-72 w-full"
        option={option}
        opts={{ renderer: 'svg' }}
        notMerge
        lazyUpdate
      />
    </div>
  )
}

const ChartArtifactCard = ({
  artifact,
  variant = 'standalone'
}: {
  artifact: ChartArtifact
  variant?: 'standalone' | 'dashboard'
}) => {
  const Icon = chartIcon[artifact.chart_type]
  const isDashboard = variant === 'dashboard'

  if (isDashboard && artifact.chart_type === 'metric') {
    return <DashboardMetricArtifact artifact={artifact} />
  }

  return (
    <section
      data-dashboard-card="true"
      className={cn(
        'w-full overflow-hidden rounded-lg border border-white/10 bg-[#0b1018] text-primary shadow-[0_18px_55px_rgba(0,0,0,0.24)]',
        !isDashboard && 'max-w-3xl'
      )}
    >
      <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0))] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-sky-100">
                <Icon className="h-4 w-4" />
              </span>
              <h3 className="truncate text-sm font-semibold text-primary">
                {artifact.title}
              </h3>
            </div>
            {artifact.insight && (
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-secondary">
                {artifact.insight}
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] uppercase text-secondary">
            {artifact.chart_type}
          </span>
        </div>
      </div>

      <div
        data-dashboard-card-body="true"
        className={cn('p-4', artifact.chart_type === 'metric' && 'grid gap-3')}
      >
        {artifact.chart_type === 'metric' && (
          <MetricArtifact artifact={artifact} />
        )}
        {artifact.chart_type === 'table' && (
          <TableArtifact artifact={artifact} />
        )}
        {['bar', 'line', 'pie'].includes(artifact.chart_type) && (
          <EChart artifact={artifact} />
        )}
      </div>
    </section>
  )
}

export default ChartArtifactCard
