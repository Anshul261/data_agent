'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3,
  ImageIcon,
  Maximize2,
  PanelRightOpen,
  X
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import AuthedImage from '@/components/ui/AuthedImage'
import { parseChartArtifacts } from '@/lib/chartArtifacts'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import type { ChatMessage } from '@/types/os'

interface ImageArtifact {
  alt: string
  createdAt: number
  artifactType: 'chart' | 'image'
  chartType?: string
  id: string
  messageId: string
  prompt: string
  url: string
}

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

const getPromptForMessage = (messages: ChatMessage[], messageIndex: number) => {
  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && message.content) {
      return message.content
    }
  }

  return 'Generated visualization'
}

const getMarkdownImages = (content: string) => {
  const images: Array<{ alt: string; url: string }> = []

  for (const match of content.matchAll(MARKDOWN_IMAGE_REGEX)) {
    const [, alt, url] = match
    if (!url) continue

    images.push({
      alt: alt || 'Generated visualization',
      url
    })
  }

  return images
}

const ImageArtifactsPanel = () => {
  const messages = useStore((state) => state.messages)
  const [isOpen, setIsOpen] = useState(true)
  const [selectedImage, setSelectedImage] = useState<ImageArtifact | null>(null)

  const artifacts = useMemo(
    () =>
      messages.flatMap((message, messageIndex) => {
        if (message.role !== 'agent') return []

        const chartArtifacts = parseChartArtifacts(message.content).map(
          (artifact, artifactIndex) => ({
            alt: artifact.title,
            artifactType: 'chart' as const,
            chartType: artifact.chart_type,
            createdAt: message.created_at,
            id: `${message.created_at}-${messageIndex}-chart-${artifactIndex}-${artifact.artifact_id ?? artifact.title}`,
            messageId: `message-${message.created_at}-${messageIndex}`,
            prompt:
              artifact.insight || getPromptForMessage(messages, messageIndex),
            url: ''
          })
        )

        const structuredImages =
          message.images?.map((image) => ({
            alt: image.revised_prompt || 'Generated visualization',
            url: image.url
          })) ?? []
        const markdownImages = getMarkdownImages(message.content)
        const images = [...structuredImages, ...markdownImages]

        return [
          ...chartArtifacts,
          ...images.map((image, imageIndex) => ({
            alt: image.alt,
            artifactType: 'image' as const,
            createdAt: message.created_at,
            id: `${message.created_at}-${messageIndex}-${imageIndex}-${image.url}`,
            messageId: `message-${message.created_at}-${messageIndex}`,
            prompt: getPromptForMessage(messages, messageIndex),
            url: image.url
          }))
        ]
      }),
    [messages]
  )

  const handleJumpToMessage = (messageId: string) => {
    document.getElementById(messageId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    })
  }

  if (artifacts.length === 0) return null

  if (!isOpen) {
    return (
      <Button
        aria-label="Open visualization gallery"
        className="absolute right-4 top-4 z-20 border-border bg-background/95 shadow-lg backdrop-blur"
        size="icon"
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
      >
        <PanelRightOpen className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <>
      <aside className="hidden w-72 shrink-0 border-l border-border/60 bg-background-secondary/40 lg:flex lg:flex-col">
        <div className="flex h-14 items-center justify-between border-b border-border/60 px-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium text-primary">Artifacts</p>
              <p className="text-xs text-secondary">
                {artifacts.length} artifact
                {artifacts.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <Button
            aria-label="Hide visualization gallery"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid gap-3">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                className={cn(
                  'group overflow-hidden rounded-lg border border-border/70 bg-background text-left shadow-sm transition-colors',
                  'focus-visible:ring-ring hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-1'
                )}
                type="button"
                onClick={() => handleJumpToMessage(artifact.messageId)}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-background-secondary">
                  {artifact.artifactType === 'chart' ? (
                    <div className="flex h-full flex-col justify-between bg-[#0b1018] p-3">
                      <div className="flex items-center justify-between">
                        <span className="rounded-md border border-primary/10 bg-primary/5 p-1.5 text-primary">
                          <BarChart3 className="h-4 w-4" />
                        </span>
                        <span className="rounded-full border border-primary/10 px-2 py-1 text-[10px] uppercase text-secondary">
                          {artifact.chartType}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-14 rounded-md border border-primary/10 bg-[linear-gradient(135deg,rgba(56,189,248,0.24),rgba(34,197,94,0.08))]" />
                        <div className="grid grid-cols-4 gap-1">
                          <span className="h-1 rounded bg-primary/20" />
                          <span className="h-1 rounded bg-primary/35" />
                          <span className="h-1 rounded bg-primary/15" />
                          <span className="h-1 rounded bg-primary/30" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <AuthedImage
                        src={artifact.url}
                        alt={artifact.alt}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    </>
                  )}
                  <span className="absolute right-2 top-2 rounded-md bg-background/90 p-1 text-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="space-y-1 p-3">
                  <p className="line-clamp-2 text-sm font-medium text-primary">
                    {artifact.alt}
                  </p>
                  <p className="line-clamp-2 text-xs text-secondary">
                    {artifact.prompt}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="fixed inset-x-3 bottom-24 z-30 lg:hidden">
        <Button
          className="w-full justify-between rounded-lg border-border bg-background/95 shadow-lg backdrop-blur"
          type="button"
          variant="outline"
          onClick={() => setSelectedImage(artifacts[0])}
        >
          <span className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Artifacts
          </span>
          <span className="text-xs text-secondary">{artifacts.length}</span>
        </Button>
      </div>

      {selectedImage && (
        <div className="fixed inset-0 z-40 bg-background/90 p-3 backdrop-blur lg:hidden">
          <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background">
            <div className="flex h-12 items-center justify-between border-b border-border px-3">
              <p className="text-sm font-medium text-primary">Artifacts</p>
              <Button
                aria-label="Close visualization gallery"
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => setSelectedImage(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid flex-1 gap-3 overflow-y-auto p-3">
              {artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  className="overflow-hidden rounded-lg border border-border bg-background-secondary text-left"
                  type="button"
                  onClick={() => {
                    setSelectedImage(null)
                    requestAnimationFrame(() =>
                      handleJumpToMessage(artifact.messageId)
                    )
                  }}
                >
                  {artifact.artifactType === 'image' ? (
                    <AuthedImage
                      src={artifact.url}
                      alt={artifact.alt}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center bg-[#0b1018] text-primary">
                      <BarChart3 className="h-8 w-8" />
                    </div>
                  )}
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-2 text-sm font-medium text-primary">
                      {artifact.alt}
                    </p>
                    <p className="line-clamp-2 text-xs text-secondary">
                      {artifact.prompt}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ImageArtifactsPanel
