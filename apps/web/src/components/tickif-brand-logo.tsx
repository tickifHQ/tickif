import Image from 'next/image';

export function TickifBrandLogo({
  label = 'Tickif',
  tone = 'default',
}: {
  label?: string;
  tone?: 'default' | 'inverse';
}) {
  const isInverse = tone === 'inverse';

  return (
    <span className="inline-flex items-center gap-2 leading-none">
      <Image
        src="/icon.svg"
        alt=""
        width={20}
        height={20}
        aria-hidden
        className={isInverse ? 'block shrink-0 brightness-0 invert' : 'block shrink-0'}
      />
      <span
        className={
          isInverse
            ? 'text-xl leading-none text-surface-inverse-foreground'
            : 'text-xl font-medium leading-none tracking-tight text-foreground'
        }
      >
        {label}
      </span>
    </span>
  );
}
