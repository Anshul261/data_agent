import type {
  ChartArtifact,
  JsonRenderArtifact,
  JsonRenderElement
} from '@/types/os'

export const JSON_RENDER_BLOCK_REGEX = /```json-render\s*([\s\S]*?)```/g

export const stripJsonRenderBlocks = (content: string) =>
  content.replace(JSON_RENDER_BLOCK_REGEX, '').trim()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isElement = (value: unknown): value is JsonRenderElement =>
  isRecord(value) && typeof value.type === 'string'

const isJsonRenderArtifact = (
  value: unknown
): value is JsonRenderArtifact => {
  if (!isRecord(value)) return false
  if (value.kind !== 'json_render') return false
  if (value.version !== 1) return false
  if (typeof value.title !== 'string') return false
  if (!isRecord(value.spec)) return false
  if (typeof value.spec.root !== 'string') return false
  if (!isRecord(value.spec.elements)) return false

  return Object.values(value.spec.elements).every(isElement)
}

export const parseJsonRenderArtifacts = (
  content: string
): JsonRenderArtifact[] => {
  const artifacts: JsonRenderArtifact[] = []

  for (const match of content.matchAll(JSON_RENDER_BLOCK_REGEX)) {
    const [, rawJson] = match
    if (!rawJson) continue

    try {
      const parsed = JSON.parse(rawJson)
      if (isJsonRenderArtifact(parsed)) {
        artifacts.push(parsed)
      }
    } catch {
      // Keep malformed render blocks from breaking the chat view.
    }
  }

  return artifacts
}

export const isJsonRenderLayoutArtifact = (
  value: unknown
): value is JsonRenderArtifact => isJsonRenderArtifact(value)

export const cardsFromJsonRenderArtifact = (
  artifact: JsonRenderArtifact
): ChartArtifact[] => artifact.cards ?? []

export const hydrateJsonRenderArtifactCards = (
  artifact: JsonRenderArtifact,
  cards: ChartArtifact[]
): JsonRenderArtifact => {
  if (cards.length === 0) return artifact

  const byId = new Map(cards.map((card) => [card.artifact_id, card]))
  const byTitle = new Map(cards.map((card) => [card.title, card]))
  const elements = Object.fromEntries(
    Object.entries(artifact.spec.elements).map(([key, element]) => {
      if (!['Metric', 'EChart', 'DataTable'].includes(element.type)) {
        return [key, element]
      }

      const props = element.props ?? {}
      const replacement =
        byId.get(String(props.artifact_id ?? '')) ??
        byId.get(String(props.card_id ?? '')) ??
        byTitle.get(String(props.title ?? ''))

      if (!replacement) return [key, element]

      return [
        key,
        {
          ...element,
          props: {
            ...props,
            ...replacement
          }
        }
      ]
    })
  )

  return {
    ...artifact,
    cards,
    spec: {
      ...artifact.spec,
      elements
    }
  }
}
