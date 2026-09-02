'use client'

import { FC, useState, useCallback } from 'react'

import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  fetchAuthedImageBlob,
  useAuthedImage
} from '@/hooks/useAuthedImage'
import { useStore } from '@/store'

import type {
  UnorderedListProps,
  OrderedListProps,
  EmphasizedTextProps,
  ItalicTextProps,
  StrongTextProps,
  BoldTextProps,
  DeletedTextProps,
  UnderlinedTextProps,
  HorizontalRuleProps,
  BlockquoteProps,
  AnchorLinkProps,
  HeadingProps,
  ImgProps,
  ParagraphProps,
  TableHeaderCellProps,
  TableProps,
  TableHeaderProps,
  TableBodyProps,
  TableRowProps,
  TableCellProps,
  PreparedTextProps
} from './types'

import { HEADING_SIZES } from '../Heading/constants'
import { PARAGRAPH_SIZES } from '../Paragraph/constants'

const filterProps = (props: object) => {
  const newProps = { ...props }

  if ('node' in newProps) {
    delete newProps.node
  }

  return newProps
}

const UnorderedList = ({ className, ...props }: UnorderedListProps) => (
  <ul
    className={cn(
      className,
      PARAGRAPH_SIZES.body,
      'flex list-disc flex-col pl-10'
    )}
    {...filterProps(props)}
  />
)

const OrderedList = ({ className, ...props }: OrderedListProps) => (
  <ol
    className={cn(
      className,
      PARAGRAPH_SIZES.body,
      'flex list-decimal flex-col pl-10'
    )}
    {...filterProps(props)}
  />
)

const Paragraph = ({ className, ...props }: ParagraphProps) => (
  <div
    className={cn(className, PARAGRAPH_SIZES.body)}
    {...filterProps(props)}
  />
)

const EmphasizedText = ({ className, ...props }: EmphasizedTextProps) => (
  <em
    className={cn(className, 'text-sm font-semibold')}
    {...filterProps(props)}
  />
)

const ItalicText = ({ className, ...props }: ItalicTextProps) => (
  <i
    className={cn(className, 'italic', PARAGRAPH_SIZES.body)}
    {...filterProps(props)}
  />
)

const StrongText = ({ className, ...props }: StrongTextProps) => (
  <strong
    className={cn(className, 'text-sm font-semibold')}
    {...filterProps(props)}
  />
)

const BoldText = ({ className, ...props }: BoldTextProps) => (
  <b
    className={cn(className, 'text-sm font-semibold')}
    {...filterProps(props)}
  />
)

const UnderlinedText = ({ className, ...props }: UnderlinedTextProps) => (
  <u
    className={cn(className, 'underline', PARAGRAPH_SIZES.body)}
    {...filterProps(props)}
  />
)

const DeletedText = ({ className, ...props }: DeletedTextProps) => (
  <del
    className={cn(className, 'text-muted line-through', PARAGRAPH_SIZES.body)}
    {...filterProps(props)}
  />
)

const HorizontalRule = ({ className, ...props }: HorizontalRuleProps) => (
  <hr
    className={cn(className, 'mx-auto w-48 border-b border-border')}
    {...filterProps(props)}
  />
)

const InlineCode: FC<PreparedTextProps> = ({ children }) => {
  return (
    <code className="relative whitespace-pre-wrap rounded-sm bg-background-secondary/50 p-1">
      {children}
    </code>
  )
}

const Blockquote = ({ className, ...props }: BlockquoteProps) => (
  <blockquote
    className={cn(className, 'italic', PARAGRAPH_SIZES.body)}
    {...filterProps(props)}
  />
)

const AnchorLink = ({ className, ...props }: AnchorLinkProps) => (
  <a
    className={cn(className, 'cursor-pointer text-xs underline')}
    target="_blank"
    rel="noopener noreferrer"
    {...filterProps(props)}
  />
)

const Heading1 = ({ className, ...props }: HeadingProps) => (
  <h1 className={cn(className, HEADING_SIZES[3])} {...filterProps(props)} />
)

const Heading2 = ({ className, ...props }: HeadingProps) => (
  <h2 className={cn(className, HEADING_SIZES[3])} {...filterProps(props)} />
)

const Heading3 = ({ className, ...props }: HeadingProps) => (
  <h3 className={cn(className, PARAGRAPH_SIZES.lead)} {...filterProps(props)} />
)

const Heading4 = ({ className, ...props }: HeadingProps) => (
  <h4 className={cn(className, PARAGRAPH_SIZES.lead)} {...filterProps(props)} />
)

const Heading5 = ({ className, ...props }: HeadingProps) => (
  <h5
    className={cn(className, PARAGRAPH_SIZES.title)}
    {...filterProps(props)}
  />
)

const Heading6 = ({ className, ...props }: HeadingProps) => (
  <h6
    className={cn(className, PARAGRAPH_SIZES.title)}
    {...filterProps(props)}
  />
)

// ─── Chart Image with Download ───────────────────────────────────────────────

const DownloadIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const EditIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const Img = ({ src, alt }: ImgProps) => {
  const [error, setError] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const { chatInputRef } = useStore()
  const authToken = useStore((state) => state.authToken)

  const strSrc = typeof src === 'string' ? src : null
  // Chart URLs need the bearer token, which an <img> tag cannot send.
  const { src: resolvedSrc, error: authError } = useAuthedImage(strSrc)

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      if (!strSrc || downloading) return
      setDownloading(true)
      try {
        const blob = await fetchAuthedImageBlob(strSrc, authToken)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = (alt || 'chart') + '.png'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch {
        window.open(strSrc, '_blank')
      } finally {
        setDownloading(false)
      }
    },
    [strSrc, alt, downloading, authToken]
  )

  const handleModify = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const el = chatInputRef?.current
      if (!el) return
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set
      nativeSetter?.call(el, 'Update this chart to ')
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.focus()
      // place cursor at end
      const len = el.value.length
      el.setSelectionRange(len, len)
    },
    [chatInputRef]
  )

  if (!strSrc) return null

  return (
    <div className="group relative w-full max-w-xl">
      {error || authError ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md bg-secondary/50 text-muted">
          <Paragraph className="text-primary">Image unavailable</Paragraph>
          <Link
            href={strSrc}
            target="_blank"
            className="max-w-md truncate underline"
          >
            {strSrc}
          </Link>
        </div>
      ) : (
        <>
          <Image
            src={resolvedSrc ?? strSrc}
            width={1280}
            height={720}
            alt={alt ?? 'Rendered image'}
            className="size-full rounded-md object-cover"
            onError={() => setError(true)}
            unoptimized
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 opacity-0 transition-all duration-150 group-hover:opacity-100">
            <button
              onClick={handleModify}
              title="Modify chart"
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
                'border border-primary/20 bg-background/85 backdrop-blur-sm',
                'text-xs font-medium text-primary/80',
                'hover:border-primary/40 hover:bg-background hover:text-primary'
              )}
            >
              <EditIcon />
              Modify
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              title="Download chart"
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
                'border border-primary/20 bg-background/85 backdrop-blur-sm',
                'text-xs font-medium text-primary/80',
                'hover:border-primary/40 hover:bg-background hover:text-primary',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              <DownloadIcon />
              {downloading ? 'Saving…' : 'Download'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Enhanced Data Table ──────────────────────────────────────────────────────

const Table = ({ className, children, ...props }: TableProps) => (
  <div className="my-1 w-full overflow-hidden rounded-lg border border-primary/15">
    <div className="max-h-[480px] w-full overflow-auto">
      <table
        className={cn(className, 'w-full min-w-full border-collapse')}
        {...filterProps({ ...props, children })}
      />
    </div>
  </div>
)

const TableHead = ({ className, ...props }: TableHeaderProps) => (
  <thead
    className={cn(
      className,
      'sticky top-0 z-10 border-b border-primary/15',
      'bg-background/95 backdrop-blur-sm'
    )}
    {...filterProps(props)}
  />
)

const TableHeadCell = ({ className, ...props }: TableHeaderCellProps) => (
  <th
    className={cn(
      className,
      'whitespace-nowrap px-3 py-2.5 text-left',
      'text-xs font-semibold uppercase tracking-wider text-primary/60',
      'border-r border-primary/10 last:border-r-0'
    )}
    {...filterProps(props)}
  />
)

const TableBody = ({ className, ...props }: TableBodyProps) => (
  <tbody className={cn(className, 'divide-y divide-primary/8')} {...filterProps(props)} />
)

const TableRow = ({ className, ...props }: TableRowProps) => (
  <tr
    className={cn(
      className,
      'transition-colors duration-75',
      'odd:bg-transparent even:bg-primary/[0.03]',
      'hover:bg-primary/[0.06]'
    )}
    {...filterProps(props)}
  />
)

const TableCell = ({ className, ...props }: TableCellProps) => (
  <td
    className={cn(
      className,
      'whitespace-nowrap px-3 py-2 text-xs text-secondary/85',
      'border-r border-primary/8 last:border-r-0'
    )}
    {...filterProps(props)}
  />
)

export const components = {
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  h5: Heading5,
  h6: Heading6,
  ul: UnorderedList,
  ol: OrderedList,
  em: EmphasizedText,
  i: ItalicText,
  strong: StrongText,
  b: BoldText,
  u: UnderlinedText,
  del: DeletedText,
  hr: HorizontalRule,
  blockquote: Blockquote,
  code: InlineCode,
  a: AnchorLink,
  img: Img,
  p: Paragraph,
  table: Table,
  thead: TableHead,
  th: TableHeadCell,
  tbody: TableBody,
  tr: TableRow,
  td: TableCell
}
