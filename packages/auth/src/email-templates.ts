import { createElement as h } from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  render,
  toPlainText,
} from 'react-email';

/** All transactional variants. Keep authentication timing owned by better-auth. */
export type TickifEmail =
  | { kind: 'verify-email'; name: string; url: string }
  | {
      kind: 'otp';
      purpose: 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';
      code: string;
    }
  | { kind: 'phone-otp'; phoneNumber: string; code: string }
  | { kind: 'invitation'; organization: string; inviter: string; url: string }
  | { kind: 'invitation-declined'; organization: string; email: string }
  | { kind: 'ownership-requested' }
  | { kind: 'ownership-previous'; newOwner: string }
  | { kind: 'ownership-new' }
  | { kind: 'verification-approved' }
  | { kind: 'verification-changes' | 'verification-revoked'; note?: string | null };

type Content = {
  category: string;
  title: string;
  description: string;
  detail?: string;
  code?: string;
  note?: string | null;
  action?: { label: string; url: string };
};

function httpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Email links must use HTTP or HTTPS');
  }
  return url.toString();
}

function contentFor(input: TickifEmail, baseUrl: string): Content {
  const studio = {
    label: 'Open studio settings',
    url: new URL('/designer/terms-roles', baseUrl).href,
  };
  const verification = {
    label: 'Open verification',
    url: new URL('/designer/verification', baseUrl).href,
  };
  switch (input.kind) {
    case 'verify-email':
      return {
        category: 'Your account',
        title: 'Make it official.',
        description: `${input.name.trim() ? `Hi ${input.name}, ` : ''}verify your email address to continue with Tickif.`,
        detail:
          'If you didn’t create this account or request verification, you can ignore this email.',
        action: { label: 'Verify email', url: httpUrl(input.url) },
      };
    case 'otp': {
      const copy = {
        'sign-in': ['Welcome back.', 'Use this code to sign in to your Tickif account.'],
        'email-verification': [
          'Verify your email.',
          'Use this code to confirm your email address on Tickif.',
        ],
        'change-email': [
          'Confirm your new email.',
          'Use this code to confirm your new email address on Tickif.',
        ],
        'forget-password': [
          'Reset your password.',
          'Use this code to continue your Tickif password reset.',
        ],
      }[input.purpose];
      return {
        category: 'Your account',
        title: copy[0]!,
        description: copy[1]!,
        code: input.code,
        detail:
          'This code expires in 5 minutes. Never share it with anyone. If you didn’t request it, you can ignore this email.',
      };
    }
    case 'phone-otp':
      return {
        category: 'Test login',
        title: 'Your test login code.',
        description: `Use this code for the Tickif phone login requested for ${input.phoneNumber}.`,
        code: input.code,
        detail:
          'This code expires in 5 minutes. This test message was sent to the configured test inbox. Never share this code.',
      };
    case 'invitation':
      return {
        category: 'Your studio',
        title: `A place for you at ${input.organization}.`,
        description: `${input.inviter} invited you to join ${input.organization} on Tickif. Open the invitation to review your studio access.`,
        detail:
          'This invitation expires in 7 days. If you weren’t expecting it, you can ignore this email.',
        action: { label: 'Review invitation', url: httpUrl(input.url) },
      };
    case 'invitation-declined':
      return {
        category: 'Your studio',
        title: 'Invitation declined.',
        description: `${input.email} declined the invitation to ${input.organization}.`,
        detail: 'You can review your team and pending invitations in studio settings.',
        action: studio,
      };
    case 'ownership-requested':
      return {
        category: 'Studio ownership',
        title: 'Your studio’s next chapter.',
        description: 'You have been nominated as Owner of your Tickif organization.',
        detail:
          'Review the transfer in studio settings and choose whether to accept. Ownership changes only after you accept.',
        action: { ...studio, label: 'Review transfer' },
      };
    case 'ownership-previous':
      return {
        category: 'Studio ownership',
        title: 'Ownership transferred.',
        description: `${input.newOwner} is now the organization Owner. Your role is now Admin.`,
        detail: 'The transfer is complete. You can review your current access in studio settings.',
        action: studio,
      };
    case 'ownership-new':
      return {
        category: 'Studio ownership',
        title: 'You’re now the Owner.',
        description:
          'The ownership transfer is complete. You are now the Tickif organization Owner.',
        detail: 'Open studio settings to review your team, roles, and organization access.',
        action: studio,
      };
    case 'verification-approved':
      return {
        category: 'Tickif Review Team',
        title: 'You’re verified.',
        description:
          'Your Tickif verification is approved. Your verified status is now visible on Tickif.',
        detail: 'Thank you for helping build a trusted community of design professionals.',
        action: verification,
      };
    case 'verification-changes':
      return {
        category: 'Tickif Review Team',
        title: 'A few changes to get verified.',
        description:
          'Changes requested for your Tickif verification. Review the feedback, replace the requested documents, and resubmit your verification.',
        note: input.note,
        action: { ...verification, label: 'Review requested changes' },
      };
    case 'verification-revoked':
      return {
        category: 'Tickif Review Team',
        title: 'Your verification is under review again.',
        description:
          'Your verified status has been removed while the Tickif Review Team reviews your profile again.',
        note: input.note,
        detail: 'Open verification to review the latest status and any next steps.',
        action: verification,
      };
  }
}

// Email-safe sRGB counterparts of packages/ui/src/styles/themes/tickif.css.
// Avoid CSS variables, external fonts, SVG, flex, and scripts in inbox HTML.
const colors = {
  ink: '#18181b',
  muted: '#71717a',
  primary: '#1a9b7a',
  surface: '#eef2f0',
  border: '#e2e8e5',
};
const paragraph = { fontSize: '16px', lineHeight: '26px', color: '#3f3f46', margin: '0 0 20px' };

export function TickifEmailTemplate({
  email,
  publicWebUrl,
}: {
  email: TickifEmail;
  publicWebUrl: string;
}) {
  const baseUrl = httpUrl(publicWebUrl);
  const content = contentFor(email, baseUrl);
  return h(
    Html,
    { lang: 'en' },
    h(Head),
    h(Preview, null, content.description),
    h(
      Body,
      {
        style: {
          backgroundColor: colors.surface,
          margin: 0,
          padding: '32px 12px',
          fontFamily: 'Inter, Arial, Helvetica, sans-serif',
          color: colors.ink,
        },
      },
      h(
        Container,
        { style: { maxWidth: '560px', width: '100%', margin: '0 auto' } },
        h(
          Section,
          { style: { padding: '0 12px 24px' } },
          h(
            Link,
            {
              href: baseUrl,
              style: {
                color: colors.ink,
                textDecoration: 'none',
                fontSize: '24px',
                fontWeight: 600,
              },
            },
            h(Img, {
              src: new URL('/images/email/tickif-mark.png', baseUrl).href,
              alt: '',
              width: 24,
              height: 24,
              style: { display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' },
            }),
            'Tickif',
          ),
        ),
        h(
          Section,
          {
            style: {
              backgroundColor: '#ffffff',
              border: `1px solid ${colors.border}`,
              borderTop: `4px solid ${colors.primary}`,
              borderRadius: '8px',
              padding: '32px 24px',
            },
          },
          h(
            Text,
            {
              style: {
                color: colors.muted,
                fontSize: '12px',
                letterSpacing: '1.4px',
                textTransform: 'uppercase',
                margin: '0 0 16px',
                fontWeight: 600,
              },
            },
            content.category,
          ),
          h(
            Heading,
            {
              as: 'h1',
              style: {
                color: colors.ink,
                fontSize: '28px',
                lineHeight: '36px',
                letterSpacing: '-0.6px',
                margin: '0 0 20px',
                fontWeight: 600,
              },
            },
            content.title,
          ),
          h(Text, { style: paragraph }, content.description),
          content.code
            ? h(
                Section,
                {
                  style: {
                    backgroundColor: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    margin: '8px 0 24px',
                    textAlign: 'center',
                  },
                },
                h(
                  Text,
                  {
                    style: {
                      fontFamily: '"JetBrains Mono", Consolas, monospace',
                      fontSize: '32px',
                      fontWeight: 700,
                      letterSpacing: '6px',
                      lineHeight: '40px',
                      margin: '20px 0',
                    },
                  },
                  content.code,
                ),
              )
            : null,
          content.note
            ? h(
                Section,
                {
                  style: {
                    backgroundColor: colors.surface,
                    borderLeft: `3px solid ${colors.primary}`,
                    padding: '16px',
                    marginBottom: '24px',
                  },
                },
                h(
                  Text,
                  { style: { ...paragraph, fontSize: '13px', fontWeight: 600, margin: '0 0 6px' } },
                  'Reviewer note',
                ),
                h(
                  Text,
                  {
                    style: {
                      ...paragraph,
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    },
                  },
                  content.note,
                ),
              )
            : null,
          content.detail
            ? h(
                Text,
                {
                  style: {
                    ...paragraph,
                    fontSize: '14px',
                    lineHeight: '22px',
                    color: colors.muted,
                  },
                },
                content.detail,
              )
            : null,
          content.action
            ? h(
                Section,
                null,
                h(
                  Button,
                  {
                    href: content.action.url,
                    style: {
                      backgroundColor: colors.ink,
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: 600,
                      padding: '14px 22px',
                      borderRadius: '8px',
                      textDecoration: 'none',
                    },
                  },
                  content.action.label,
                ),
                h(
                  Text,
                  {
                    style: {
                      fontSize: '12px',
                      lineHeight: '19px',
                      color: colors.muted,
                      margin: '20px 0 0',
                      wordBreak: 'break-all',
                    },
                  },
                  'Button not working? Copy this link into your browser: ',
                  h(
                    Link,
                    {
                      href: content.action.url,
                      style: { color: '#166b55', textDecoration: 'underline' },
                    },
                    content.action.url,
                  ),
                ),
              )
            : null,
          h(Hr, { style: { borderColor: colors.border, margin: '28px 0 20px' } }),
          h(Text, { style: { ...paragraph, fontSize: '14px', margin: 0 } }, 'The Tickif team'),
        ),
        h(
          Text,
          {
            style: {
              color: colors.muted,
              fontSize: '12px',
              lineHeight: '20px',
              padding: '0 12px',
              margin: '20px 0 0',
            },
          },
          'Tickif · A home for great design.',
          h('br'),
          'An update about your Tickif account or studio.',
        ),
      ),
    ),
  );
}

/** Render at send time on the server; the same HTML produces the text alternative. */
export async function renderTickifEmail(email: TickifEmail, publicWebUrl: string) {
  const html = await render(h(TickifEmailTemplate, { email, publicWebUrl }));
  return { html, text: toPlainText(html) };
}
