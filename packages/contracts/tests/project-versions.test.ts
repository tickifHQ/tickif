import { describe, expect, it } from 'vitest';
import { classifyProjectEdit } from '../src/project-versions';

describe('material project edits', () => {
  const approved = ['a', 'b', 'c', 'd', 'e'];
  it('publishes descriptions and completion-month corrections within the same year immediately', () => {
    expect(
      classifyProjectEdit(
        { completedMonth: '2025-01' },
        { description: 'Updated', completedMonth: '2025-09' },
        approved,
        approved,
      ),
    ).toBe('minor');
  });
  it('requires review for city, budget and completion-year changes', () => {
    expect(
      classifyProjectEdit({ citySlug: 'pune' }, { citySlug: 'mumbai' }, approved, approved),
    ).toBe('material');
    expect(
      classifyProjectEdit(
        { completedMonth: '2025-01' },
        { completedMonth: '2026-01' },
        approved,
        approved,
      ),
    ).toBe('material');
    expect(classifyProjectEdit({}, { budgetBandSlug: 'premium' }, approved, approved)).toBe(
      'material',
    );
  });
  it('uses a strict greater-than-20-percent boundary against unique approved IDs', () => {
    expect(classifyProjectEdit({}, {}, approved, approved.slice(1))).toBe('minor');
    expect(classifyProjectEdit({}, {}, approved, approved.slice(2))).toBe('material');
    expect(classifyProjectEdit({}, {}, approved, [...approved, 'f', 'f'])).toBe('minor');
    expect(classifyProjectEdit({}, {}, approved, [...approved, 'f', 'g'])).toBe('material');
  });
  it('counts cumulative replacement and handles an empty baseline deterministically', () => {
    expect(classifyProjectEdit({}, {}, approved, ['c', 'd', 'e', 'f', 'g'])).toBe('material');
    expect(classifyProjectEdit({}, {}, [], [])).toBe('minor');
    expect(classifyProjectEdit({}, {}, [], ['a'])).toBe('material');
  });
});
