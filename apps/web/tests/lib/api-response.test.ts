import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractApiErrorMessage, handleApiResponse } from '../../src/lib/api-response';

describe('API response helpers', () => {
  it('formats nested validation details even when the envelope has no summary message', () => {
    expect(
      extractApiErrorMessage(
        { error: { details: [{ path: ['cityIds', 2], message: 'Invalid selection' }] } },
        'Fallback',
      ),
    ).toBe('cityIds.2: Invalid selection');
  });

  it('validates successful response payloads', async () => {
    const schema = z.object({ value: z.string() });
    const response = new Response(JSON.stringify({ value: 42 }), { status: 200 });

    await expect(
      handleApiResponse(response, schema, 'Request failed.', 'Response was invalid.'),
    ).rejects.toThrow('Response was invalid.');
  });
});
