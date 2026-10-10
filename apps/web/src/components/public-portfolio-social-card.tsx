import type { CSSProperties } from 'react';
import { DEFAULT_PORTFOLIO_ACCENT, type PublicPortfolioResponse } from '@repo/contracts';
import { validPortfolioAccent } from '@/lib/portfolio-accent';
import { portfolioShareFacts } from '@/lib/portfolio-share-card';
import {
  studioInitials,
  studioLocation,
  studioType,
  websiteLabel,
} from '@/lib/public-portfolio-view';

function fitText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Satori cannot resolve CSS variables; these are the light portfolio theme roles. */
const ink = '#171612';
const paper = '#ffffff';
const muted = '#726e63';
const border = 'rgba(23,22,18,0.16)';
const mono: CSSProperties = { fontFamily: 'JetBrains Mono', fontWeight: 400 };

/** The on-page sharing card, composed in the flex-only subset supported by Satori. */
export function PublicPortfolioSocialCard({ portfolio }: { portfolio: PublicPortfolioResponse }) {
  const accent = validPortfolioAccent(portfolio.accentColor) ?? DEFAULT_PORTFOLIO_ACCENT;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(accent.slice(offset, offset + 2), 16));
  const backdrop = `rgb(${channels.map((value) => Math.round(value * 0.12 + 255 * 0.88)).join(',')})`;
  const grid = `rgba(${channels.join(',')},0.07)`;
  const facts = portfolioShareFacts(portfolio);
  const location = studioLocation(portfolio, portfolio.projects.projects);
  const verified = portfolio.sections.tickifBadge && portfolio.isKycVerified;
  const name = fitText(portfolio.displayName, 72);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: ink,
        fontFamily: 'Inter',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: 48,
          borderRadius: 40,
          backgroundColor: paper,
          backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, height: 96, flexShrink: 0 }}>
          {portfolio.logoUrl ? (
            <img
              src={portfolio.logoUrl}
              alt={`${portfolio.displayName} logo`}
              width={96}
              height={96}
              style={{ objectFit: 'contain', borderRadius: 16, background: paper, flexShrink: 0 }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 96,
                height: 96,
                borderRadius: 16,
                background: backdrop,
                fontSize: 28,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {studioInitials(portfolio.displayName)}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 8 }}>
            <div
              style={{
                display: 'flex',
                fontSize: name.length > 36 ? 32 : 42,
                fontWeight: 700,
                lineHeight: 1.12,
                wordBreak: 'break-all',
              }}
            >
              {name}
            </div>
            <div
              style={{
                ...mono,
                display: 'flex',
                fontSize: 18,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: muted,
              }}
            >
              {fitText(`${studioType(portfolio)}${location ? ` · ${location}` : ''}`, 76)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 32, marginTop: 28, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignContent: 'flex-start',
              width: portfolio.heroCoverUrl ? 660 : 1104,
            }}
          >
            {facts.map((fact, index) => (
              <div
                key={fact.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 12,
                  width: '50%',
                  height: 150,
                  padding: '16px 22px',
                  borderStyle: 'solid',
                  borderColor: border,
                  borderWidth: `${index < 2 ? 1 : 0}px 1px 1px ${index % 2 === 0 ? 1 : 0}px`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontSize: fact.value.length > 12 ? 36 : 56,
                    lineHeight: 1.1,
                  }}
                >
                  {fact.value}
                </div>
                <div
                  style={{
                    ...mono,
                    display: 'flex',
                    fontSize: 15,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    color: muted,
                  }}
                >
                  {fact.label}
                </div>
              </div>
            ))}
          </div>
          {portfolio.heroCoverUrl ? (
            <img
              src={portfolio.heroCoverUrl}
              alt={`${portfolio.displayName} portfolio preview`}
              width={412}
              height={300}
              style={{ objectFit: 'cover', borderRadius: '206px 206px 16px 16px', flexShrink: 0 }}
            />
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            marginTop: 18,
          }}
        >
          <div
            style={{
              ...mono,
              display: 'flex',
              alignItems: 'center',
              border: `1px solid ${accent}`,
              borderRadius: 10,
              height: 40,
              fontSize: 16,
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <span style={{ padding: '0 16px' }}>TICKIF</span>
            <div
              style={{
                display: 'flex',
                width: 32,
                height: 40,
                borderLeft: `1px solid ${accent}`,
                borderRight: `1px solid ${accent}`,
                backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 5px, ${accent} 5px, ${accent} 6px)`,
              }}
            />
            <span style={{ padding: '0 16px' }}>{verified ? 'Verified' : 'Portfolio'}</span>
          </div>
          <div
            style={{
              ...mono,
              display: 'flex',
              fontSize: 14,
              maxWidth: 560,
              wordBreak: 'break-all',
            }}
          >
            {fitText(websiteLabel(portfolio.canonicalUrl), 90)}
          </div>
        </div>
      </div>
    </div>
  );
}
