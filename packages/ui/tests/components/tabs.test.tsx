import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../src/components/tabs';

describe('Tabs', () => {
  it.each(['segmented', 'line'] as const)(
    'preserves keyboard selection and disabled-tab behavior in the %s style',
    async (variant) => {
      const user = userEvent.setup();
      render(
        <Tabs defaultValue="photos">
          <TabsList variant={variant} aria-label="Project information">
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="private" disabled>
              Private
            </TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </TabsList>
          <TabsContent value="photos">Photo gallery</TabsContent>
          <TabsContent value="reviews">Homeowner reviews</TabsContent>
        </Tabs>,
      );
      await user.tab();
      expect(screen.getByRole('tab', { name: 'Photos' })).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'Reviews' })).toHaveFocus();
      expect(screen.getByRole('tab', { name: 'Reviews' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Homeowner reviews');
    },
  );

  it('shows the default tab and switches on click', async () => {
    const user = userEvent.setup();

    render(
      <Tabs defaultValue="photos">
        <TabsList>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
        </TabsList>
        <TabsContent value="photos">Photo gallery</TabsContent>
        <TabsContent value="reviews">Homeowner reviews</TabsContent>
      </Tabs>,
    );

    expect(screen.getByText('Photo gallery')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Reviews' }));

    expect(screen.getByText('Homeowner reviews')).toBeInTheDocument();
  });
});
