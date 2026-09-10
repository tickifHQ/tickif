import { MODERATION_REASON_OPTIONS, type ModerationReasonCode } from '@repo/contracts';

export function ProjectModerationReasons({
  reasonCodes,
}: {
  reasonCodes: readonly ModerationReasonCode[];
}) {
  if (reasonCodes.length === 0) return null;

  return (
    <ul className="space-y-2 text-sm">
      {reasonCodes.map((code) => {
        const option = MODERATION_REASON_OPTIONS.find((option) => option.value === code);
        if (!option) return null;
        return (
          <li key={code}>
            <p className="font-medium">{option.label}</p>
            <p className="text-muted-foreground">{option.description}</p>
          </li>
        );
      })}
    </ul>
  );
}
