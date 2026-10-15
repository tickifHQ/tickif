'use client';

import { useEffect, useRef } from 'react';

export function ProfileTestimonialQuote({ quote }: { quote: string }) {
  const containerRef = useRef<HTMLQuoteElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const words = quote.trim().split(/\s+/);
  const displayQuote = words.length > 60 ? `${words.slice(0, 60).join(' ')}…` : quote;

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const fit = () => {
      if (!container.clientHeight || !container.clientWidth) return;
      const maximum =
        Number.parseFloat(
          getComputedStyle(container).getPropertyValue('--profile-quote-font-size'),
        ) || 44;
      let size = maximum;
      container.style.fontSize = `${size}px`;
      while (size > 16 && text.scrollHeight > container.clientHeight) {
        size -= 1;
        container.style.fontSize = `${size}px`;
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    document.fonts?.addEventListener('loadingdone', fit);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', fit);
    };
  }, [displayQuote]);

  return (
    <blockquote ref={containerRef}>
      <span ref={textRef}>
        <span aria-hidden="true" className="profile-punctuation">
          “
        </span>
        {displayQuote}
        <span aria-hidden="true" className="profile-punctuation">
          ”
        </span>
      </span>
    </blockquote>
  );
}
