'use client';

import { useEffect, useRef, useState, useId } from 'react';

export function CompanyStory({ story }: { story: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  const id = useId();
  useEffect(() => {
    const element = paragraph.current;
    if (!element || expanded) return;
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [story, expanded]);
  return (
    <>
      <p ref={paragraph} id={id} className={expanded ? 'is-expanded' : undefined}>
        {story}
      </p>
      {overflow || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Read less' : 'Read more'}{' '}
          <img
            src="/profile/about/arrow.svg"
            alt=""
            width={12}
            height={12}
            style={{ rotate: expanded ? '-90deg' : '90deg' }}
          />
        </button>
      ) : null}
    </>
  );
}
