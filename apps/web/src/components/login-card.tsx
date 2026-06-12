'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Separator } from '@repo/ui/components/separator';
import { countries as allCountries } from 'country-codes-flags-phone-codes';
import { OtpInput } from '@/components/otp-input';

interface LoginCardProps {
  onSuccess?: () => void;
}

type Step = 'phone' | 'otp';
type OtpDigits = string[];

interface Country {
  code: string;
  flag: string;
  name: string;
}

const countries: Country[] = allCountries
  .filter((c) => c.dialCode)
  .map((c) => ({ code: c.dialCode, flag: c.flag, name: c.name }))
  .sort((a, b) => {
    if (a.name === 'India') return -1;
    if (b.name === 'India') return 1;
    return a.name.localeCompare(b.name);
  });

const COOLDOWN_SECONDS = 30;

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function LoginCard({ onSuccess }: LoginCardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [selectedCountry, setSelectedCountry] = useState<Country>(countries[0]!);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState<OtpDigits>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [success, setSuccess] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredCountries = countrySearch
    ? countries.filter((c) => {
        const q = countrySearch.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q)
        );
      })
    : countries;

  const cooldownRef = useRef(cooldown);
  cooldownRef.current = cooldown;

  useEffect(() => {
    if (!success) return;
    if (onSuccess) {
      onSuccess();
    } else {
      router.push('/');
    }
  }, [success, router, onSuccess]);

  // re-arm the interval only when the timer starts/stops (boolean flip),
  // not every tick — the live tick value is read from cooldownRef
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      if (cooldownRef.current <= 1) {
        clearInterval(id);
        setCooldown(0);
      } else {
        setCooldown((prev) => prev - 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown > 0]);

  const validatePhone = useCallback((value: string): string | null => {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 10) return 'Enter a valid 10-digit phone number';
    return null;
  }, []);

  async function handleSendOtp() {
    const fullPhone = `${selectedCountry.code}${phone.replace(/\D/g, '')}`;
    const validationError = validatePhone(phone);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: fullPhone });
      if (error) {
        setError(error.message || 'Failed to send OTP');
        return;
      }
      setStep('otp');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send OTP';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    const fullPhone = `${selectedCountry.code}${phone.replace(/\D/g, '')}`;
    const otp = code.join('');
    if (otp.length !== 6) {
      setError('Enter the full 6-digit OTP');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const { error } = await authClient.phoneNumber.verify({ phoneNumber: fullPhone, code: otp });
      if (error) {
        setError(error.message || 'Invalid or expired OTP');
        setCode(['', '', '', '', '', '']);
        return;
      }
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid or expired OTP';
      setError(message);
      setCode(['', '', '', '', '', '']);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError('');
    setCode(['', '', '', '', '', '']);
    setLoading(true);
    const fullPhone = `${selectedCountry.code}${phone.replace(/\D/g, '')}`;
    try {
      const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: fullPhone });
      if (error) {
        setError(error.message || 'Failed to resend OTP');
        return;
      }
      setCooldown(COOLDOWN_SECONDS);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resend OTP';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
    setError('');
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError('');
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: window.location.origin });
      if (result?.error) {
        setError('Couldn\'t sign in with Google');
      }
    } catch {
      setError('Couldn\'t sign in with Google');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Card className="mx-auto w-full max-w-[440px] p-8 text-center">
        <p className="text-lg font-medium text-success">Signed in</p>
        <p className="mt-1 text-sm text-muted-foreground">Redirecting…</p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-[440px] p-8">
      <div className="flex flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="warning" className="gap-1.5">
            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            Trusted by 50,000+ homeowners
          </Badge>
          <div className="flex flex-col items-center gap-1 px-0 pt-2">
            <h2 className="text-center font-display text-lg font-semibold text-foreground">
              Unlock 12,400+ real homes
            </h2>
            <p className="text-center text-sm text-muted-foreground">
              Sign in free to browse all projects, save favorites, and contact designers directly.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-4">
          {step === 'phone' ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="flex">
                  <DropdownMenu
                    onOpenChange={(open) => {
                      if (!open) setCountrySearch('');
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-l-md border border-r-0 border-input bg-muted px-2.5 py-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        disabled={loading}
                      >
                        <span className="text-base leading-none">{selectedCountry.flag}</span>
                        {selectedCountry.code}
                        <svg className="size-3.5 shrink-0 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={2} collisionPadding={8} className="max-h-60 overflow-y-auto max-w-[calc(100vw-1rem)]">
                      <div className="sticky top-0 -mx-1 -mt-1 mb-1 z-10 bg-popover px-1 pt-1 shadow-sm">
                        <input
                          ref={searchRef}
                          type="text"
                          placeholder="Search countries..."
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              if (countrySearch) {
                                e.preventDefault();
                                setCountrySearch('');
                                return;
                              }
                              return;
                            }
                            e.stopPropagation();
                          }}
                          className="w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          autoFocus
                        />
                      </div>
                      {filteredCountries.length > 0 ? (
                        filteredCountries.map((country) => (
                          <DropdownMenuItem
                            key={`${country.code}-${country.name}`}
                            onSelect={() => setSelectedCountry(country)}
                            className="gap-2"
                          >
                            <span className="text-base leading-none">{country.flag}</span>
                            <span className="text-muted-foreground">{country.code}</span>
                            <span className="text-foreground">{country.name}</span>
                          </DropdownMenuItem>
                        ))
                      ) : (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                          No countries found
                        </div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="9876543210"
                    value={phone}
                    onChange={handlePhoneChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendOtp();
                    }}
                    className="-ml-px rounded-l-none"
                    disabled={loading}
                    autoComplete="tel"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="button"
                onClick={handleSendOtp}
                disabled={loading || phone.length < 10}
                className="w-full"
              >
                {loading ? 'Sending…' : 'Login'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="flex flex-col items-center">
                <p className="text-sm font-medium text-foreground">Enter OTP</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sent to {selectedCountry.code} {phone}
                </p>

                <div className="mt-3">
                  <OtpInput
                    value={code}
                    onChange={setCode}
                    onComplete={handleVerify}
                    disabled={loading}
                  />
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldown > 0 || loading}
                    className="px-2 py-2 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:no-underline disabled:opacity-50"
                  >
                    {cooldown > 0
                      ? `Resend in ${formatTimer(cooldown)}`
                      : 'Resend OTP'}
                  </button>
                </div>
              </div>

              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

              <Button
                type="button"
                onClick={handleVerify}
                disabled={loading || code.some((d) => !d)}
                className="mt-4 w-full"
              >
                {loading ? 'Verifying…' : 'Verify OTP'}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setError('');
                  setCode(['', '', '', '', '', '']);
                }}
                className="mt-4 w-full px-2 py-2 text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Change phone number
              </button>
            </div>
          )}

          {step === 'phone' && (
            <>
              <Separator className="my-1" />

              <div className="flex flex-col items-center gap-2">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                  onClick={handleGoogleLogin}
                >
                  <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  By continuing you agree to our Terms and Privacy policy.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
