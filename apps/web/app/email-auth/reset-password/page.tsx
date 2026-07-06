'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Card } from '@repo/ui/components/card';

/**
 * Password reset page — user arrives here from the reset email link.
 * URL: /email-auth/reset-password?token=...
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const errorParam = searchParams.get('error');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(errorParam === 'INVALID_TOKEN' ? 'Invalid or expired reset link.' : '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleReset() {
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!token) {
      setError('Invalid reset link — no token found');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword,
        token,
      });
      if (resetError) {
        setError(resetError.message ?? 'Password reset failed');
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold">Password reset successful</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You can now sign in with your new password.
          </p>
          <Button className="mt-4" onClick={() => router.push('/email-auth')}>
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-semibold">Set new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your new password below.
        </p>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => { e.preventDefault(); handleReset(); }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={loading || !token} className="mt-2">
            {loading ? 'Resetting...' : 'Reset Password'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
