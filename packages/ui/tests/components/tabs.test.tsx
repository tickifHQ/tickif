import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../src/components/tabs';

describe('Tabs', () => {
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
