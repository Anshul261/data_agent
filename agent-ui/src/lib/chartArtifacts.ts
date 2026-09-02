import type { ChartArtifact } from '@/types/os'

export const CHART_ARTIFACT_BLOCK_REGEX = /```chart-artifact\s*([\s\S]*?)```/g

export const stripChartArtifactBlocks = (content: string) =>
  content.replace(CHART_ARTIFACT_BLOCK_REGEX, '').trim()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isChartArtifact = (value: unknown): value is ChartArtifact => {
  if (!isRecord(value)) return false
  if (value.kind !== 'chart_artifact') return false
  if (value.version !== 1) return false
  if (typeof value.title !== 'string') return false
  if (
    !['metric', 'line', 'bar', 'pie', 'table'].includes(
      String(value.chart_type)
    )
  ) {
    return false
  }
  if (!Array.isArray(value.data)) return false
  return value.data.every(isRecord)
}

export const parseChartArtifacts = (content: string): ChartArtifact[] => {
  const artifacts: ChartArtifact[] = []

  for (const match of content.matchAll(CHART_ARTIFACT_BLOCK_REGEX)) {
    const [, rawJson] = match
    if (!rawJson) continue

    try {
      const parsed = JSON.parse(rawJson)
      if (isChartArtifact(parsed)) {
        artifacts.push(parsed)
      }
    } catch {
      // Ignore invalid artifact blocks so a malformed chart never breaks chat.
    }
  }

  return artifacts
}
