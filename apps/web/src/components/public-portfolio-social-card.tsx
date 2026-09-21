import type { CSSProperties } from 'react';
import type { PublicPortfolioResponse } from '@repo/contracts';
import { studioLocation, studioType } from '@/lib/public-portfolio-view';

const DEFAULT_ACCENT = '#ff7a59';
const MAX_CARD_NAME_LENGTH = 72;
const MAX_CARD_TAGLINE_LENGTH = 140;

function safeAccentColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_ACCENT;
}

function ratingLabel(portfolio: PublicPortfolioResponse): string | null {
  const source = portfolio.stats.google ?? portfolio.stats.tickif;
  if (!source || source.reviewCount < 1) return null;
  return `${source.rating.toFixed(1)} rating · ${source.reviewCount} review${source.reviewCount === 1 ? '' : 's'}`;
}

function fitText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Static, Satori-compatible markup used by the dynamic portfolio social image. */
export function PublicPortfolioSocialCard({ portfolio }: { portfolio: PublicPortfolioResponse }) {
  const projects = portfolio.projects.projects;
  const location = studioLocation(portfolio, projects);
  const rating = ratingLabel(portfolio);
  const accent = safeAccentColor(portfolio.accentColor);
  const displayName = fitText(portfolio.displayName, MAX_CARD_NAME_LENGTH);
  const tagline = portfolio.tagline
    ? fitText(portfolio.tagline, MAX_CARD_TAGLINE_LENGTH)
    : null;
  const titleFontSize = displayName.length > 60 ? 46 : displayName.length > 36 ? 56 : 68;
  const taglineFontSize = tagline && tagline.length > 100 ? 25 : 29;
  const initials = portfolio.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
  const rootStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '64px 72px',
    color: '#f8fafc',
    background: `linear-gradient(135deg, #07130f 0%, #10291f 70%, ${accent} 160%)`,
    fontFamily: 'sans-serif',
  };

  return (
    <div style={rootStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div
          style={{
            width: 58,
            height: 58,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 18,
            backgroundColor: accent,
            color: '#07130f',
            fontSize: 23,
            fontWeight: 800,
          }}
        >
          {initials || 'T'}
        </div>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>tickif</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 940 }}>
        <div style={{ display: 'flex', color: '#a7f3d0', fontSize: 24, marginBottom: 18 }}>
          {studioType(portfolio)}
          {location ? ` · ${location}` : ''}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: titleFontSize,
            lineHeight: 1.05,
            fontWeight: 800,
            overflowWrap: 'anywhere',
          }}
        >
          {displayName}
        </div>
        {tagline ? (
          <div
            style={{
              display: 'flex',
              marginTop: 24,
              fontSize: taglineFontSize,
              lineHeight: 1.35,
              color: '#d1fae5',
              overflowWrap: 'anywhere',
            }}
          >
            {tagline}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 34, color: '#d1d5db', fontSize: 23 }}>
        <div style={{ display: 'flex' }}>
          {portfolio.stats.projectCount} project{portfolio.stats.projectCount === 1 ? '' : 's'}
        </div>
        {rating ? <div style={{ display: 'flex' }}>{rating}</div> : null}
        {portfolio.isKycVerified ? <div style={{ display: 'flex' }}>Verified on Tickif</div> : null}
      </div>
    </div>
  );
}
