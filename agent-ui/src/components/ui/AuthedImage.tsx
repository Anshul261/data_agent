'use client'

import { useAuthedImage } from '@/hooks/useAuthedImage'

interface AuthedImageProps {
  src: string
  alt: string
  className?: string
  fallback?: React.ReactNode
}

/**
 * An `<img>` that can load chart URLs sitting behind the agent's JWT
 * middleware. Safe to use inside a map, unlike the hook on its own.
 */
const AuthedImage = ({ src, alt, className, fallback }: AuthedImageProps) => {
  const { src: resolvedSrc, error } = useAuthedImage(src)

  if (error) return <>{fallback ?? null}</>
  if (!resolvedSrc) return null

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolvedSrc} alt={alt} className={className} />
}

export default AuthedImage
