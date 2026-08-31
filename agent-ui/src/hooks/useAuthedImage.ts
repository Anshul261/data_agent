'use client'
import { useEffect, useState } from 'react'

import { useStore } from '@/store'

/**
 * Chart images are served from `/api/charts/{id}`, which sits behind the
 * agent's JWT middleware. An `<img>` tag cannot send an Authorization
 * header, so fetch those URLs with the bearer token and hand back an object
 * URL instead. Any other src passes through untouched.
 */
export const isChartUrl = (src: string) => {
  try {
    return new URL(src).pathname.startsWith('/api/charts/')
  } catch {
    return false
  }
}

export function useAuthedImage(src: string | null) {
  const authToken = useStore((state) => state.authToken)
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(
    src && !isChartUrl(src) ? src : null
  )
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!src) {
      setResolvedSrc(null)
      return
    }

    if (!isChartUrl(src)) {
      setResolvedSrc(src)
      setError(false)
      return
    }

    if (!authToken) {
      setError(true)
      return
    }

    let objectUrl: string | null = null
    let cancelled = false
    setError(false)

    fetch(src, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.blob()
      })
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setResolvedSrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, authToken])

  return { src: resolvedSrc, error }
}

/** Fetch a chart image as a blob so it can be downloaded or opened. */
export async function fetchAuthedImageBlob(
  src: string,
  authToken: string
): Promise<Blob> {
  const response = await fetch(
    src,
    isChartUrl(src)
      ? { headers: { Authorization: `Bearer ${authToken}` } }
      : undefined
  )
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
  return response.blob()
}
