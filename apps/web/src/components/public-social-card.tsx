import { TickifBrandIcon } from '@/components/brand-icons';

/** Fixed-size, Satori-compatible card; image inputs have already been validated. */
export function PublicSocialCard({
  title,
  description,
  eyebrow = 'Real spaces. Real inspiration.',
  image,
  studio,
  logo,
}: {
  title: string;
  description?: string | null;
  eyebrow?: string;
  image?: string | null;
  studio?: string;
  logo?: string | null;
}) {
  const heading = title.length > 95 ? `${title.slice(0, 94).trimEnd()}…` : title;
  const summary =
    description && description.length > 170
      ? `${description.slice(0, 169).trimEnd()}…`
      : description;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#07130f',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: image ? '48px' : '64px 72px',
          width: image ? 700 : 1200,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <TickifBrandIcon width={44} height={44} color="#f8fafc" />
          <span style={{ fontSize: 28 }}>Tickif</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'block',
              color: '#a7f3d0',
              fontSize: 21,
              marginBottom: 18,
              wordBreak: 'break-word',
              lineClamp: 1,
            }}
          >
            {eyebrow.slice(0, 90)}
          </div>
          <div
            style={{
              display: 'block',
              fontSize: heading.length > 55 ? 48 : 60,
              lineHeight: 1.08,
              fontWeight: 800,
              wordBreak: 'break-word',
              lineClamp: 3,
            }}
          >
            {heading}
          </div>
          {summary ? (
            <div
              style={{
                display: 'block',
                fontSize: 24,
                lineHeight: 1.35,
                marginTop: 24,
                color: '#d1fae5',
                wordBreak: 'break-word',
                lineClamp: 2,
              }}
            >
              {summary}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            minHeight: 56,
            fontSize: 23,
            color: '#d1d5db',
          }}
        >
          {logo ? (
            <img
              src={logo}
              alt="Studio logo"
              width={56}
              height={56}
              style={{
                objectFit: 'contain',
                background: '#ffffff',
                borderRadius: 12,
                flexShrink: 0,
              }}
            />
          ) : null}
          <span
            style={{
              display: 'block',
              flex: 1,
              minWidth: 0,
              lineHeight: 1.2,
              wordBreak: 'break-word',
              lineClamp: 2,
            }}
          >
            {studio ? studio.slice(0, 72) : 'Architecture · Construction · Interior'}
          </span>
        </div>
      </div>
      {image ? (
        <img
          src={image}
          alt="Published project"
          width={500}
          height={630}
          style={{ objectFit: 'cover', flexShrink: 0 }}
        />
      ) : null}
    </div>
  );
}
