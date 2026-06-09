'use client';

import { Button } from '@repo/ui/components/button';
import { authClient } from '@/lib/auth-client';
import { useState } from 'react';

export function GoogleLoginButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setLoading(true);
    setError('');
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: window.location.origin });
      if (result?.error) {
        setError('Google sign-in is not configured');
        setLoading(false);
      }
    } catch {
      setError('Google sign-in is not available');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="w-full"
        disabled={loading}
        onClick={handleClick}
      >
        {loading ? 'Connecting…' : 'Continue with Google'}
      </Button>
      {error && <p className="text-center text-xs text-red-600">{error}</p>}
    </div>
  );
}
