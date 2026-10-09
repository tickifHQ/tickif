/** Motion timings measured from the supplied Anika Spaces Portfolio HTML. */
const REVEAL_TARGETS = [
  '.profile-hero-copy > *',
  '.profile-identity-wrap',
  '.profile-section-header',
  '.profile-recognition-list > li',
  '.profile-project-card',
  '.profile-story',
  '.profile-review-summary',
  '.profile-review-card',
  '.profile-centres-card',
  '.profile-share > *',
  '.profile-consultation-inner > *',
].join(',');

export function mountProfileMotion(root: HTMLElement) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let stop = () => {};

  const start = () => {
    stop();
    if (reduced.matches || typeof window.IntersectionObserver !== 'function') return;
    root.dataset.profileMotion = 'enabled';
    const targets = new Set<HTMLElement>();
    const counted = new Set<HTMLElement>();
    const counts = new Map<HTMLElement, string>();
    const frames = new Set<number>();
    const queue = (fn: FrameRequestCallback) => {
      const id = requestAnimationFrame((time) => {
        frames.delete(id);
        fn(time);
      });
      frames.add(id);
      return id;
    };
    const count = (target: HTMLElement) => {
      target.querySelectorAll<HTMLElement>('[data-profile-count]').forEach((node) => {
        if (counted.has(node)) return;
        counted.add(node);
        const final = node.textContent ?? '';
        // Budget ranges stay intact: animating a single endpoint would change their meaning.
        const parts = final.match(/^([^\d]*)(\d+(?:\.\d+)?)([^\d]*)$/);
        if (!parts) return;
        const to = Number(parts[2]);
        const from = node.dataset.profileCount === 'Established' ? Math.min(1990, to) : 0;
        const decimals = parts[2]!.split('.')[1]?.length ?? 0;
        counts.set(node, final);
        const began = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - began) / 1600);
          node.textContent =
            progress === 1
              ? final
              : `${parts[1]}${(from + (to - from) * (1 - (1 - progress) ** 3)).toFixed(decimals)}${parts[3]}`;
          if (progress < 1) queue(tick);
        };
        queue(tick);
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          target.dataset.profileInview = String(entry.isIntersecting);
          if (!entry.isIntersecting) continue;
          target.dataset.profileReveal = 'visible';
          count(target);
          // The orbit and contact pulse pause when their sections leave the viewport.
          if (!target.matches('.profile-identity-wrap, .profile-consultation-inner > p')) {
            observer.unobserve(target);
          }
        }
      },
      { threshold: 0.12 },
    );
    const collect = () => {
      root.querySelectorAll<HTMLElement>(REVEAL_TARGETS).forEach((target) => {
        if (targets.has(target)) return;
        targets.add(target);
        const index = Array.from(target.parentElement?.children ?? []).indexOf(target);
        const delay = target.matches('.profile-project-card')
          ? (index % 2) * 120
          : target.matches('.profile-recognition-list > li')
            ? index * 80
            : target.matches('.profile-review-card')
              ? index * 90
              : 0;
        target.style.setProperty('--profile-reveal-delay', `${delay}ms`);
        const rect = target.getBoundingClientRect();
        // Never conceal server-rendered content already on screen or at a deep link.
        target.dataset.profileReveal =
          rect.top >= window.innerHeight * 0.95 ? 'pending' : 'visible';
        observer.observe(target);
      });
    };
    collect();
    const changes = new MutationObserver((records) => {
      // Text frames from the counters are deliberately ignored.
      if (
        records.some((record) =>
          Array.from(record.addedNodes).some((node) => node instanceof HTMLElement),
        )
      )
        collect();
    });
    changes.observe(root, { childList: true, subtree: true });

    const card = root.querySelector<HTMLElement>('.profile-identity-card');
    let pointerFrame: number | undefined;
    const resetTilt = () => {
      if (pointerFrame !== undefined) {
        cancelAnimationFrame(pointerFrame);
        frames.delete(pointerFrame);
        pointerFrame = undefined;
      }
      if (!card) return;
      delete card.dataset.profileTilting;
      for (const name of [
        '--profile-tilt-x',
        '--profile-tilt-y',
        '--profile-light-x',
        '--profile-light-y',
      ])
        card.style.removeProperty(name);
    };
    const move = (event: PointerEvent) => {
      if (!card || !finePointer.matches || event.pointerType === 'touch') return;
      if (pointerFrame !== undefined) {
        cancelAnimationFrame(pointerFrame);
        frames.delete(pointerFrame);
      }
      pointerFrame = queue(() => {
        pointerFrame = undefined;
        const rect = card.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        card.dataset.profileTilting = 'true';
        card.style.setProperty('--profile-tilt-y', `${(x - 0.5) * 14}deg`);
        card.style.setProperty('--profile-tilt-x', `${(0.5 - y) * 12}deg`);
        card.style.setProperty('--profile-light-x', `${x * 100}%`);
        card.style.setProperty('--profile-light-y', `${y * 100}%`);
      });
    };
    const focus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      // Mouse focus happens between pointerdown and pointerup. Snapping the
      // reveal then can move the control away from the click's release point.
      if (!event.target.matches(':focus-visible')) return;
      const target = event.target.closest<HTMLElement>('[data-profile-reveal="pending"]');
      if (target) target.dataset.profileReveal = 'visible';
    };
    const visibility = () => {
      root.dataset.profilePaused = String(document.hidden);
      if (document.hidden) {
        resetTilt();
        frames.forEach(cancelAnimationFrame);
        frames.clear();
        counts.forEach((value, node) => {
          node.textContent = value;
        });
      }
    };
    visibility();
    card?.addEventListener('pointermove', move, { passive: true });
    card?.addEventListener('pointerleave', resetTilt);
    finePointer.addEventListener('change', resetTilt);
    root.addEventListener('focusin', focus);
    document.addEventListener('visibilitychange', visibility);
    stop = () => {
      observer.disconnect();
      changes.disconnect();
      frames.forEach(cancelAnimationFrame);
      counts.forEach((value, node) => {
        node.textContent = value;
      });
      resetTilt();
      targets.forEach((target) => {
        delete target.dataset.profileReveal;
        delete target.dataset.profileInview;
        target.style.removeProperty('--profile-reveal-delay');
      });
      delete root.dataset.profileMotion;
      delete root.dataset.profilePaused;
      card?.removeEventListener('pointermove', move);
      card?.removeEventListener('pointerleave', resetTilt);
      finePointer.removeEventListener('change', resetTilt);
      root.removeEventListener('focusin', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  };
  start();
  reduced.addEventListener('change', start);
  return () => {
    reduced.removeEventListener('change', start);
    stop();
  };
}
