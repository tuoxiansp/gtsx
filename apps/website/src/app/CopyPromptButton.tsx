import { useState } from "react"

export function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button className="paper-button paper-button-secondary" type="button" onClick={handleCopy}>
      {copied ? "Copied" : "Copy full setup prompt"}
    </button>
  )
}
