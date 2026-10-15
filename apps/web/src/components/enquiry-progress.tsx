import type { EnquiryResponse } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import {
  Timeline,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@repo/ui/components/reui/timeline';
import { cn } from '@repo/ui/lib/utils';

export function enquiryReadThrough(enquiry: EnquiryResponse) {
  if (enquiry.activity?.readThrough) return enquiry.activity.readThrough;
  return new Date(
    Math.max(
      Date.parse(enquiry.createdAt),
      Date.parse(enquiry.activity?.viewedAt ?? '') || 0,
      Date.parse(enquiry.activity?.lastMessageAt ?? '') || 0,
    ),
  ).toISOString();
}

export function EnquiryProgress({ enquiry }: { enquiry: EnquiryResponse }) {
  const activity = enquiry.activity;
  const step = activity?.contactedAt ? 3 : activity?.viewedAt ? 2 : 1;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {enquiry.status === 'responded' && !activity?.contactedAt ? (
        <Badge variant="warning">Responded</Badge>
      ) : null}
      <Timeline
        orientation="horizontal"
        value={step}
        className="flex-wrap gap-1.5 [&[data-orientation=horizontal]]:w-auto"
        aria-label="Enquiry progress"
      >
        {['Sent', 'Viewed', 'Contacted'].map((label, index) => (
          <TimelineItem
            key={label}
            step={index + 1}
            className="flex-none flex-row items-center gap-1.5 group-data-[orientation=horizontal]/timeline:mt-0 group-data-[orientation=horizontal]/timeline:not-last:pe-0"
          >
            <TimelineIndicator
              className={cn(
                'static size-2 border-0 group-data-[orientation=horizontal]/timeline:translate-y-0',
                index < step ? 'bg-primary' : 'bg-muted-foreground/30',
                index + 1 === step && 'ring-2 ring-primary/20',
              )}
            />
            <TimelineHeader>
              <TimelineTitle
                aria-label={`${label}, ${index < step ? 'complete' : 'pending'}`}
                className={cn(
                  'text-xs font-normal',
                  index + 1 === step ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {label}
                <span className="sr-only">{index < step ? ', complete' : ', pending'}</span>
              </TimelineTitle>
            </TimelineHeader>
            {index < 2 ? (
              <TimelineSeparator className="static self-center group-data-[orientation=horizontal]/timeline:w-4 group-data-[orientation=horizontal]/timeline:translate-x-0 group-data-[orientation=horizontal]/timeline:translate-y-0" />
            ) : null}
          </TimelineItem>
        ))}
      </Timeline>
      {enquiry.status === 'closed' ? (
        <span className="text-xs text-muted-foreground">Closed</span>
      ) : null}
    </div>
  );
}
