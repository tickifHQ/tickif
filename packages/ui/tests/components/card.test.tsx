import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../src/components/card';

describe('Card', () => {
  it('renders card sections with provided content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Project</CardTitle>
          <CardDescription>Published showcase</CardDescription>
        </CardHeader>
        <CardContent>Details</CardContent>
      </Card>,
    );

    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Published showcase')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });
});
