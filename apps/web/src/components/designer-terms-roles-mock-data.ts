export const teamRoles = [
  'admin',
  'designer',
  'project_manager',
  'sales_crm',
  'accountant',
] as const;

export type TeamRole = (typeof teamRoles)[number];

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: TeamRole;
  isCurrentUser?: boolean;
};

export type PendingTeamInvitation = {
  id: string;
  email: string;
  initials: string;
  role: TeamRole;
  invitedAgo: string;
  expiresInDays: number;
};

export type TeamWorkspacePreview = {
  planName: string;
  seatLimit: number;
  currentUserRole: TeamRole;
  members: TeamMember[];
  invitations: PendingTeamInvitation[];
};

/** Temporary view data for E-241. Replace this object when the five-role API lands. */
export const mockTeamWorkspace: TeamWorkspacePreview = {
  planName: 'Corporate',
  seatLimit: 10,
  currentUserRole: 'admin',
  members: [
    {
      id: 'member-anika',
      name: 'Anika Subramanian',
      email: 'anika@acme.in',
      initials: 'AS',
      role: 'admin',
      isCurrentUser: true,
    },
    {
      id: 'member-riya',
      name: 'Riya P.',
      email: 'riya@acme.in',
      initials: 'RP',
      role: 'designer',
    },
    {
      id: 'member-arjun',
      name: 'Arjun M.',
      email: 'arjun@acme.in',
      initials: 'AM',
      role: 'project_manager',
    },
    {
      id: 'member-kavya',
      name: 'Kavya S.',
      email: 'kavya@acme.in',
      initials: 'KS',
      role: 'sales_crm',
    },
    {
      id: 'member-meera',
      name: 'Meera K.',
      email: 'meera@acme.in',
      initials: 'MK',
      role: 'accountant',
    },
  ],
  invitations: [
    {
      id: 'invite-junior',
      email: 'junior@livspace.in',
      initials: 'JU',
      role: 'designer',
      invitedAgo: '5 days ago',
      expiresInDays: 5,
    },
    {
      id: 'invite-copywriter',
      email: 'copywriter@livspace.in',
      initials: 'CO',
      role: 'sales_crm',
      invitedAgo: '2 days ago',
      expiresInDays: 2,
    },
  ],
};
