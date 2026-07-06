'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Card } from '@repo/ui/components/card';

type Mode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-sent';

/**
 * Email authentication page for designers.
 * Supports: sign up, sign in, and password reset.
 */
export default function EmailAuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSignUp() {
    setError('');
    setLoading(true);
    try {
      const { error: signUpError } = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: '/designer/onboarding',
      });
      if (signUpError) {
        setError(signUpError.message ?? 'Sign up failed');
      } else {
        setMessage('Account created! Check your email to verify your address.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    setError('');
    setLoading(true);
    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
        callbackURL: '/designer/onboarding',
      });
      if (signInError) {
        setError(signInError.message ?? 'Sign in failed');
      } else {
        router.push('/designer/onboarding');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError('');
    setLoading(true);
    try {
      const { error: resetError } = await authClient.requestPasswordReset({
        email,
        redirectTo: '/email-auth/reset-password',
      });
      if (resetError) {
        setError(resetError.message ?? 'Failed to send reset email');
      } else {
        setMode('reset-sent');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  }

  if (message) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <Button className="mt-4" variant="outline" onClick={() => { setMessage(''); setMode('sign-in'); }}>
            Back to Sign In
          </Button>
        </Card>
      </div>
    );
  }

  if (mode === 'reset-sent') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold">Reset email sent</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Check your inbox for a password reset link.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => setMode('sign-in')}>
            Back to Sign In
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-semibold">
          {mode === 'sign-up' && 'Create your account'}
          {mode === 'sign-in' && 'Sign in to Tickif'}
          {mode === 'forgot-password' && 'Reset your password'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'sign-up' && 'Sign up with your email to get started.'}
          {mode === 'sign-in' && 'Welcome back. Sign in with your email.'}
          {mode === 'forgot-password' && "Enter your email and we'll send a reset link."}
        </p>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === 'sign-up') handleSignUp();
            else if (mode === 'sign-in') handleSignIn();
            else if (mode === 'forgot-password') handleForgotPassword();
          }}
        >
          {mode === 'sign-up' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          {mode !== 'forgot-password' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? 'Loading...' : mode === 'sign-up' ? 'Create Account' : mode === 'sign-in' ? 'Sign In' : 'Send Reset Link'}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm">
          {mode === 'sign-in' && (
            <>
              <button type="button" className="text-primary underline" onClick={() => setMode('forgot-password')}>
                Forgot password?
              </button>
              <span className="mx-2 text-muted-foreground">·</span>
              <button type="button" className="text-primary underline" onClick={() => setMode('sign-up')}>
                Create account
              </button>
            </>
          )}
          {mode === 'sign-up' && (
            <button type="button" className="text-primary underline" onClick={() => setMode('sign-in')}>
              Already have an account? Sign in
            </button>
          )}
          {mode === 'forgot-password' && (
            <button type="button" className="text-primary underline" onClick={() => setMode('sign-in')}>
              Back to sign in
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
