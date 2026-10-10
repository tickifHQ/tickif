/** Public destinations; the matching Markdown files live in content/company. */
export const companyPages = [
  {
    slug: 'about',
    title: 'About',
    description: 'Discover Tickif and the people behind it.',
    status: 'sample',
  },
  {
    slug: 'report-a-problem',
    title: 'Report a problem',
    description: 'Find the right route for service issues, billing concerns and safety reports.',
    status: 'draft',
  },
  {
    slug: 'takedown-policy',
    title: 'Takedown policy',
    description: 'Protecting creative work, personal privacy and a fair right to review.',
    status: 'draft',
  },
  {
    slug: 'terms',
    title: 'Terms',
    description: 'Your responsibilities, your content and how Tickif’s services work.',
    status: 'draft',
  },
  {
    slug: 'privacy',
    title: 'Privacy',
    description:
      'What information Tickif handles, why it is used and the choices available to you.',
    status: 'draft',
  },
] as const;
