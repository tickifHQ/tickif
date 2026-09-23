import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlogBody } from '../../src/components/blog-body';

describe('BlogBody', () => {
  it('contains long Markdown tokens and code blocks on narrow screens', () => {
    const { container } = render(
      <BlogBody
        content={`A${'longword'.repeat(30)}\n\n\`\`\`text\n${'longcode'.repeat(30)}\n\`\`\``}
      />,
    );

    const body = container.firstElementChild;
    expect(body).toHaveClass('break-words');
    expect(body).toHaveClass('[&_pre]:max-w-full');
    expect(body).toHaveClass('[&_pre]:overflow-x-auto');
    expect(container.querySelector('pre')).toBeInTheDocument();
  });

  it('renders Markdown text without raw HTML, images, or unsafe links', () => {
    const { container } = render(
      <BlogBody
        content={
          '## Useful heading\n\n<script>alert(1)</script>\n\n![track](https://example.com/track.png)\n\n[Unsafe](javascript:alert(1))'
        }
      />,
    );

    expect(screen.getByRole('heading', { name: 'Useful heading' })).toBeInTheDocument();
    expect(container.querySelector('script, img')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Unsafe' })).toBeNull();
  });
});
