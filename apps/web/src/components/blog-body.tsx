import Markdown from 'react-markdown';

/** Markdown only: no raw HTML, images, or custom URL protocols in articles. */
export function BlogBody({ content }: { content: string }) {
  return (
    <div className="min-w-0 space-y-5 break-words pt-9 leading-8 text-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_h2]:pt-5 [&_h2]:font-display [&_h2]:text-2xl [&_h3]:font-display [&_h3]:text-xl [&_li]:ml-6 [&_ol]:list-decimal [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_ul]:list-disc">
      <Markdown
        skipHtml
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
