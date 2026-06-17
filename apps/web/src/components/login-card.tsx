'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Avatar, AvatarFallback } from '@repo/ui/components/avatar';
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
import { Tabs, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
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

const browsingFeatures = [
  { icon: 'bookmark', title: 'Save what you love' },
  { icon: 'message', title: 'Message designers' },
  { icon: 'calendar', title: 'Book free consultations' },
] as const;

const designerFeatures = [
  { icon: 'bookmark', title: 'Share your work anywhere' },
  { icon: 'message', title: 'Get bookings from home owners' },
  { icon: 'calendar', title: 'Turn visitors into clients' },
] as const;

function FeatureIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'bookmark':
      return <><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></>;
    case 'message':
      return <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
    case 'calendar':
      return <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>;
    default:
      return null;
  }
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
  const [loginMode, setLoginMode] = useState<'browsing' | 'designer'>('browsing');
  const [countrySearch, setCountrySearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const features = loginMode === 'designer' ? designerFeatures : browsingFeatures;
  const promoSubtitle = loginMode === 'designer'
    ? 'One link to share your work, get discovered, and turn views into real enquiries.'
    : 'Save the homes you love, message designers, and book free consultations.';

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
    const callbackURL = window.location.origin;
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL });
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

  function renderPhoneStep() {
    return (
      <div className="flex flex-col overflow-hidden md:flex-row">
        {/* Left: Brand / Promo Panel */}
        <div className="flex w-full flex-col justify-between rounded-xl bg-muted px-6 py-8 md:my-1 md:ml-1 md:w-[315px] md:shrink-0">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-1.5 rounded-md border border-muted-foreground/20 px-2.5 py-1 w-fit">
              <svg className="size-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="text-xs text-muted-foreground">Trusted by 5000+ homeowners</span>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="font-display text-2xl font-semibold text-foreground">
                Welcome to Tickif
              </h2>
              <p className="text-xs text-muted-foreground">{promoSubtitle}</p>

              <div className="mt-6 flex flex-col gap-3">
                {features.map((f) => (
                  <div key={f.title} className="flex items-center gap-2.5">
                    <svg className="size-4 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <FeatureIcon icon={f.icon} />
                    </svg>
                    <p className="text-sm font-medium text-foreground">{f.title}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <div className="flex -space-x-2">
              <Avatar className="size-8 border-2 border-muted ring-2 ring-background">
                <AvatarFallback className="bg-blue-100 text-xs font-medium text-blue-700">PK</AvatarFallback>
              </Avatar>
              <Avatar className="size-8 border-2 border-muted ring-2 ring-background">
                <AvatarFallback className="bg-amber-100 text-xs font-medium text-amber-700">RV</AvatarFallback>
              </Avatar>
              <Avatar className="size-8 border-2 border-muted ring-2 ring-background">
                <AvatarFallback className="bg-emerald-100 text-xs font-medium text-emerald-700">AM</AvatarFallback>
              </Avatar>
              <Avatar className="size-8 border-2 border-muted ring-2 ring-background">
                <AvatarFallback className="bg-violet-100 text-xs font-medium text-violet-700">SN</AvatarFallback>
              </Avatar>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">12,400+ homeowners</p>
              <p className="text-xs text-muted-foreground">
                trust Tickif
                <span className="ml-1.5 inline-flex items-center gap-1 text-amber-600">
                  <svg className="size-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  4.9 (1.5k)
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Right: Form Panel */}
        <div className="flex w-full flex-col px-6 py-8 md:flex-1">
          <div className="flex flex-col gap-5">
            <h3 className="text-base font-medium text-foreground">Login to continue</h3>

            <div className="flex flex-col gap-4">
              <Tabs
                defaultValue="browsing"
                value={loginMode}
                className="w-full"
                onValueChange={(val) => setLoginMode(val as 'browsing' | 'designer')}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="browsing" className="flex-1 gap-1.5">
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
                      <path d="M9 21V12h6v9" />
                    </svg>
                    I'm browsing
                  </TabsTrigger>
                  <TabsTrigger value="designer" className="flex-1 gap-1.5">
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 2L12 22" />
                      <path d="M3.34 7L20.66 17" />
                      <path d="M20.66 7L3.34 17" />
                    </svg>
                    Interior designer
                  </TabsTrigger>
                </TabsList>

                <div className="relative mt-4 overflow-hidden">
                  <div
                    className="flex transition-transform duration-300 ease-in-out"
                    style={{ transform: `translateX(${loginMode === 'browsing' ? '0%' : '-100%'})` }}
                  >
                    <div className="flex w-full shrink-0 flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="phone">
                          Phone Number <span className="text-destructive">*</span>
                        </Label>
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
                        {loading ? 'Sending…' : 'Send OTP'}
                      </Button>

                      <div className="relative my-5">
                        <Separator />
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                          OR
                        </span>
                      </div>

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
                          By continuing you agree to Tickif's Terms &amp; Privacy.
                        </p>
                      </div>
                    </div>

                    <div className="flex w-full shrink-0 flex-col gap-4">
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
                        Login with Google
                      </Button>

                      <div className="relative my-2">
                        <Separator />
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                          OR
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="designer-email">
                          Email <span className="text-destructive">*</span>
                          <span className="text-xs text-muted-foreground"> (Optional)</span>
                        </Label>
                        <div className="relative">
                          <svg
                            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="M22 4 12 13 2 4" />
                          </svg>
                          <Input
                            id="designer-email"
                            type="email"
                            placeholder="hello@alignui.com"
                            className="pl-10"
                            disabled
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          This is a hint text to help user.
                        </p>
                      </div>

                      {error && <p className="text-sm text-destructive">{error}</p>}

                      <Button
                        type="button"
                        className="w-full"
                        disabled
                      >
                        Login
                      </Button>

                      <p className="text-center text-xs text-muted-foreground">
                        By continuing you agree to Tickif's Terms &amp; Privacy.
                      </p>
                    </div>
                  </div>
                </div>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderOtpStep() {
    return (
      <div className="flex flex-col items-center gap-6 px-6 py-8">
        <h3 className="text-base font-medium text-foreground">Enter verification code</h3>

        <div className="flex flex-col items-center gap-4">
          <div className="flex size-24 items-center justify-center rounded-full bg-muted">
            <svg className="size-14 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <p className="text-base text-muted-foreground">
            We've sent a code to{' '}
            <span className="font-medium text-foreground">
              {selectedCountry.code} {phone}
            </span>
          </p>
        </div>

        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={handleVerify}
          disabled={loading}
        />

        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || loading}
          className="text-base text-muted-foreground underline-offset-2 hover:underline disabled:no-underline disabled:opacity-50"
        >
          {cooldown > 0
            ? `Didn't get the code? Resend in ${formatTimer(cooldown)}`
            : "Didn't get the code? Resend"}
        </button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex w-full gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => {
              setStep('phone');
              setError('');
              setCode(['', '', '', '', '', '']);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleVerify}
            disabled={loading || code.some((d) => !d)}
            className="flex-1"
          >
            {loading ? 'Verifying…' : 'Continue'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-[760px]">
      {step === 'otp' ? (
        <div className="mx-auto max-w-[440px]">{renderOtpStep()}</div>
      ) : (
        renderPhoneStep()
      )}
    </Card>
  );
}
