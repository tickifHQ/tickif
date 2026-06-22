'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Asterisk,
  Bookmark,
  Calendar,
  ChevronDown,
  House,
  LockKeyhole,
  Mail,
  MessageSquare,
  Star,
  Users,
  X,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Avatar, AvatarFallback } from '@repo/ui/components/avatar';
import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/utils';
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
  onClose?: () => void;
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

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GoogleSignInButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" className="w-full cursor-pointer" disabled={loading} onClick={onClick}>
      <GoogleIcon className="size-5 shrink-0" />
      {label}
    </Button>
  );
}

function OrSeparator({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Separator />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
        OR
      </span>
    </div>
  );
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const browsingFeatures = [
  { icon: Bookmark, title: 'Save what you love' },
  { icon: MessageSquare, title: 'Message designers' },
  { icon: Calendar, title: 'Book free consultations' },
] as const;

const designerFeatures = [
  { icon: Bookmark, title: 'Share your work anywhere' },
  { icon: MessageSquare, title: 'Get bookings from home owners' },
  { icon: Calendar, title: 'Turn visitors into clients' },
] as const;

const trustAvatars = [
  { initials: 'PK', className: 'bg-[#1a9b7a]' },
  { initials: 'RV', className: 'bg-[#3b5570]' },
  { initials: 'AM', className: 'bg-[#a8741d]' },
  { initials: 'SN', className: 'bg-[#5d4a6b]' },
] as const;

export function LoginCard({ onSuccess, onClose }: LoginCardProps) {
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
    // cooldown > 0 expression as dependency means this effect only re-runs
    // when cooldown crosses the zero boundary (0→>0 or >0→0), not on every tick
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
        <div className="flex w-full flex-col justify-between rounded-xl px-6 py-8 md:my-1 md:ml-1 md:w-[315px] md:shrink-0 [background-image:radial-gradient(circle_at_top_left,rgba(26,155,122,0.28),transparent_55%),linear-gradient(170deg,#17271f_0%,#0e1814_100%)]">
          <div className="flex flex-col gap-5">
            <div className="flex w-fit items-center gap-1.5 rounded bg-success/10 px-2 py-0.5">
              <Users className="size-3.5 text-success" aria-hidden="true" />
              <span className="text-xs font-medium text-success">Trusted by 5000+ homeowners</span>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="font-display text-3xl text-white">Welcome to Tickif</h2>
              <p className="text-xs text-white/60">{promoSubtitle}</p>

              <div className="mt-6 flex flex-col gap-3">
                {features.map((f) => {
                  const Icon = f.icon;
                  const testId = `feature-${f.title.toLowerCase().replace(/\s+/g, '-')}`;
                  return (
                    <div key={f.title} data-testid={testId} className="flex items-center gap-2.5">
                      <Icon className="size-4 shrink-0 text-white" aria-hidden="true" />
                      <p className="text-sm text-white">{f.title}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <div className="flex -space-x-2">
              {trustAvatars.map((a) => (
                <Avatar key={a.initials} className="size-7 ring-2 ring-[#131f1a]">
                  <AvatarFallback className={cn('text-[9px] font-semibold text-white', a.className)}>
                    {a.initials}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <div>
              <p className="text-xs font-medium text-white">12,400+ homeowners</p>
              <p className="inline-flex items-center gap-1.5 text-[11px] text-white/60">
                trust Tickif
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3 text-warning" fill="currentColor" aria-hidden="true" />
                  4.9 (1.5k)
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Right: Form Panel */}
        <div className="flex w-full flex-col px-6 py-8 md:flex-1">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-medium text-foreground">Login to continue</h3>
              {onClose && (
                <Button
                  onClick={onClose}
                  aria-label="Close"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <Tabs
                defaultValue="browsing"
                value={loginMode}
                className="w-full"
                onValueChange={(val) => setLoginMode(val as 'browsing' | 'designer')}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="browsing" className="flex-1 gap-1.5">
                    <House className="size-4" aria-hidden="true" />
                    I'm browsing
                  </TabsTrigger>
                  <TabsTrigger value="designer" className="flex-1 gap-1.5">
                    <Asterisk className="size-4" aria-hidden="true" />
                    I'm a designer
                  </TabsTrigger>
                </TabsList>

                <div className="relative mt-4 overflow-hidden">
                  <div
                    className="flex transition-transform duration-300 ease-in-out"
                    style={{ transform: `translateX(${loginMode === 'browsing' ? '0%' : '-100%'})` }}
                  >
                    <div
                      className={cn(
                        'flex w-full shrink-0 flex-col gap-3 transition-opacity duration-300',
                        loginMode === 'browsing' ? 'opacity-100' : 'opacity-0',
                      )}
                      inert={loginMode !== 'browsing'}
                      aria-hidden={loginMode !== 'browsing'}
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset">
                          <DropdownMenu
                            onOpenChange={(open) => {
                              if (!open) setCountrySearch('');
                            }}
                          >
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 bg-muted px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                                disabled={loading}
                              >
                                <span className="text-base leading-none">{selectedCountry.flag}</span>
                                <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
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
                            aria-label="Phone number"
                            placeholder="9123456789"
                            value={phone}
                            onChange={handlePhoneChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSendOtp();
                            }}
                            className="h-10 min-w-0 flex-1 rounded-none border-0 border-l border-input bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                            disabled={loading}
                            autoComplete="tel"
                          />
                        </div>
                      </div>

                      <Button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={loading || phone.length < 10}
                        className="w-full cursor-pointer border border-white/10 bg-[#0e121b] text-white shadow-[0px_1px_2px_0px_rgba(27,28,29,0.48),0px_0px_0px_1px_#242628] [background-image:linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_100%)] hover:bg-[#0e121b]/90"
                      >
                        {loading ? 'Sending…' : 'Get OTP'}
                      </Button>

                      <OrSeparator className="my-5" />

                      <div className="flex flex-col items-center gap-2">
                        <GoogleSignInButton label="Continue with Google" loading={loading} onClick={handleGoogleLogin} />
                      </div>
                    </div>

                    <div
                      className={cn(
                        'flex w-full shrink-0 flex-col gap-4 transition-opacity duration-300',
                        loginMode === 'designer' ? 'opacity-100' : 'opacity-0',
                      )}
                      inert={loginMode !== 'designer'}
                      aria-hidden={loginMode !== 'designer'}
                    >
                      <GoogleSignInButton label="Login with Google" loading={loading} onClick={handleGoogleLogin} />

                      <OrSeparator className="my-2" />

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="designer-email">
                          Email <span className="text-xs text-muted-foreground">(optional)</span>
                        </Label>
                        <div className="relative">
                          <Mail
                            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <Input
                            id="designer-email"
                            type="email"
                            placeholder="you@example.com"
                            className="pl-10 focus-visible:ring-inset focus-visible:ring-offset-0"
                            disabled
                          />
                        </div>
                      </div>

                      <Button
                        type="button"
                        className="w-full"
                        disabled
                      >
                        Login
                      </Button>
                    </div>
                  </div>

                  {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    By continuing you agree to Tickif's Terms &amp; Privacy.
                  </p>
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
            <LockKeyhole className="size-14 text-muted-foreground" aria-hidden="true" />
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
