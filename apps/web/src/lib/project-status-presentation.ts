import type { ProjectStatus } from '@repo/contracts';

export function projectStatusLabel(status: ProjectStatus) {
  const labels: Record<ProjectStatus, string> = {
    published: 'Live',
    submitted: 'Submitted',
    in_review: 'In review',
    changes_requested: 'Needs Change',
    rejected: 'Rejected',
    archived: 'Archived',
    delisted: 'Delisted',
    deleted: 'Deleted',
    draft: 'Draft',
  };
  return labels[status];
}

export const projectStatusDescriptions: Record<ProjectStatus, string> = {
  draft: 'Saved privately. Finish your project and submit it when you are ready.',
  submitted: 'Your submission is waiting for review. You can withdraw it to make changes.',
  in_review: 'The Tickif team is reviewing your submission. You will see the decision here.',
  published: 'This project is published and available to visitors.',
  changes_requested: 'Update the requested details, then submit your changes for review.',
  rejected:
    'This submission was not approved. Review the feedback before preparing another submission.',
  archived: 'This project is archived and no longer visible to visitors.',
  delisted: 'This project has been removed from public discovery and is unavailable to visitors.',
  deleted: 'This project has been deleted and is unavailable to visitors.',
};
