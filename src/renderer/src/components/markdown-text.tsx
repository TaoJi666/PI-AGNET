import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@renderer/lib/utils'

const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  )
}

export function MarkdownText({
  text,
  className
}: {
  text: string
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('markdown', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrl}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

function safeUrl(url: string): string {
  return /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : ''
}
