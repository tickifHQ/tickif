import Markdown from 'react-markdown';
import { typography } from '@repo/ui/lib/typography';
import { cn } from '@repo/ui/lib/utils';

/** Markdown only: no raw HTML, images, or custom URL protocols in articles. */
export function BlogBody({
  content,
  sectionIds = false,
}: {
  content: string;
  sectionIds?: boolean;
}) {
  return (
    <div
      className={cn(
        typography.bodyMd,
        'min-w-0 space-y-5 break-words pt-9 text-foreground-secondary [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-primary/40 [&_a:hover]:decoration-primary [&_blockquote]:rounded-lg [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:bg-surface-subtle [&_blockquote]:px-5 [&_blockquote]:py-4 [&_blockquote]:text-sm [&_blockquote]:leading-relaxed [&_li]:ml-6 [&_li]:mt-2 [&_ol]:list-decimal [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc',
      )}
    >
      <Markdown
        skipHtml
        components={{
          h2: ({ node, children }) => (
            <h2
              id={sectionIds ? `section-${node?.position?.start.line}` : undefined}
              className={cn(typography.headingH3, 'scroll-mt-28 pt-5 text-pretty text-foreground')}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className={cn(typography.headingH4, 'pt-3 text-foreground')}>{children}</h3>
          ),
        }}
        allowedElements={[
          'h2',
          'h3',
          'p',
          'ul',
          'ol',
          'li',
          'strong',
          'em',
          'a',
          'blockquote',
          'code',
          'pre',
          'hr',
        ]}
      >
        {content}
      </Markdown>
    </div>
  );
}
