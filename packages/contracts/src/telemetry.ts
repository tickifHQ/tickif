import { z } from 'zod';

/** Browser input is deliberately separate from authoritative server log context. */
export const telemetryLogEventSchema = z
  .strictObject({
    level: z.enum(['warn', 'error']),
    event: z.string().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/),
    message: z.string().max(1_000),
    timestamp: z.iso.datetime(),
    error: z
      .strictObject({
        name: z.string().max(80),
        message: z.string().max(1_000),
        stack: z.string().max(4_000).optional(),
      })
      .optional(),
    release: z.string().max(120).optional(),
    page: z.string().max(512).regex(/^\/(?!\/)[^?#\r\n]*$/).optional(),
    attributes: z
      .strictObject({
        component: z.string().max(120).optional(),
        errorCode: z.string().max(80).optional(),
        requestId: z.string().max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
      })
      .optional(),
  })
  .meta({ id: 'TelemetryLogEvent' });

export const telemetryLogsRequestSchema = z
  .strictObject({ events: z.array(telemetryLogEventSchema).min(1).max(20) })
  .meta({ id: 'TelemetryLogsRequest' });

export const telemetryLogsResponseSchema = z
  .strictObject({ accepted: z.number().int().min(0).max(20) })
  .meta({ id: 'TelemetryLogsResponse' });

export type TelemetryLogEvent = z.infer<typeof telemetryLogEventSchema>;
export type TelemetryLogsRequest = z.infer<typeof telemetryLogsRequestSchema>;
export type TelemetryLogsResponse = z.infer<typeof telemetryLogsResponseSchema>;
