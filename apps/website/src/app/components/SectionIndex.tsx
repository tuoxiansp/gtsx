type SectionIndexProps = {
  value: string
  label?: string
}

export function SectionIndex({ value, label }: SectionIndexProps) {
  return (
    <div className="section-index" aria-hidden="true">
      <span className="section-index-value">{value}</span>
      {label ? <span className="section-index-label">{label}</span> : null}
    </div>
  )
}
