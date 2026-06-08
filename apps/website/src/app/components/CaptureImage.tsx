import type { CaptureVariant } from "../../assets/captures"

type CaptureImageProps = {
  src: string
  alt: string
  className?: string
  variant?: CaptureVariant
}

export function CaptureImage({ src, alt, className, variant = "inline" }: CaptureImageProps) {
  const classes = ["capture-image", `capture-image--${variant}`, className].filter(Boolean).join(" ")

  return (
    <img
      className={classes}
      src={src}
      alt={alt}
      loading="eager"
      decoding="async"
      fetchPriority={variant === "hero" ? "high" : undefined}
    />
  )
}
