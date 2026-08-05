'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Asterisk,
  Bookmark,
  Calendar,
  ChevronDown,
  House,
  Mail,
  MessageSquare,
  Star,
  Users,
  X,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { hasCompletedVisitorOnboarding } from '@/lib/visitor-onboarding';
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
import { GoogleBrandIcon } from '@/components/brand-icons';
import { DESIGNER_AUTH_CONTINUE_PATH } from '@/lib/auth-paths';

type LoginMode = 'browsing' | 'designer';

interface LoginCardProps {
  initialMode?: LoginMode;
  callbackPath?: string;
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
      <GoogleBrandIcon className="size-5 shrink-0" />
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

function visitorPostLoginPath() {
  return hasCompletedVisitorOnboarding() ? '/' : '/onboarding';
}

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

export function LoginCard({ initialMode = 'browsing', callbackPath, onSuccess, onClose }: LoginCardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [selectedCountry, setSelectedCountry] = useState<Country>(countries[0]!);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState<OtpDigits>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [success, setSuccess] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>(initialMode);
  const [countrySearch, setCountrySearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Email OTP state (designer tab)
  const [designerEmail, setDesignerEmail] = useState('');
  const [emailOtpStep, setEmailOtpStep] = useState<'email' | 'otp'>('email');
  const [emailOtp, setEmailOtp] = useState<OtpDigits>(['', '', '', '', '', '']);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [emailMessage, setEmailMessage] = useState('');

  const features = loginMode === 'designer' ? designerFeatures : browsingFeatures;
  const promoSubtitle = loginMode === 'designer'
    ? 'One link to share your work, get discovered, and turn views into real enquiries.'
    : 'Save the homes you love, message designers, and book free consultations.';

  const filteredCountries = countrySearch
    ? countries.filter((c) => {
        const q = countrySearch.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
      })
    : countries;

  const cooldownRef = useRef(cooldown);
  cooldownRef.current = cooldown;
  const emailCooldownRef = useRef(emailCooldown);
  emailCooldownRef.current = emailCooldown;

  useEffect(() => {
    if (!success) return;
    if (onSuccess) {
      onSuccess();
      return;
    }
    // An explicit callback (invitation deep-link) wins over the default routing.
    if (callbackPath) {
      window.location.href = callbackPath;
      return;
    }
    // Otherwise continue through the server-rendered login page so it resolves
    // the fresh Better Auth session and owns the platform-role redirect.
    if (loginMode === 'designer') {
      router.replace(DESIGNER_AUTH_CONTINUE_PATH);
    } else {
      router.push(visitorPostLoginPath());
    }
  }, [success, loginMode, router, callbackPath, onSuccess]);

  // Phone OTP cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      if (cooldownRef.current <= 1) { clearInterval(id); setCooldown(0); }
      else setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown > 0]);

  // Email OTP cooldown
  useEffect(() => {
    if (emailCooldown <= 0) return;
    const id = setInterval(() => {
      if (emailCooldownRef.current <= 1) { clearInterval(id); setEmailCooldown(0); }
      else setEmailCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [emailCooldown > 0]);

  const validatePhone = useCallback((value: string): string | null => {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 10) return 'Enter a valid 10-digit phone number';
    return null;
  }, []);

  // ─── Phone OTP handlers ─────────────────────────────────────────────────
  async function handleSendOtp() {
    const fullPhone = `${selectedCountry.code}${phone.replace(/\D/g, '')}`;
    const validationError = validatePhone(phone);
    if (validationError) { setError(validationError); return; }
    setError('');
    setLoading(true);
    try {
      const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: fullPhone });
      if (error) { setError(error.message || 'Failed to send OTP'); return; }
      setStep('otp');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally { setLoading(false); }
  }

  async function handleVerify() {
    const fullPhone = `${selectedCountry.code}${phone.replace(/\D/g, '')}`;
    const otp = code.join('');
    if (otp.length !== 6) { setError('Enter the full 6-digit OTP'); return; }
    setError('');
    setLoading(true);
    try {
      const { error } = await authClient.phoneNumber.verify({ phoneNumber: fullPhone, code: otp });
      if (error) { setError(error.message || 'Invalid or expired OTP'); setCode(['', '', '', '', '', '']); return; }
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid or expired OTP');
      setCode(['', '', '', '', '', '']);
    } finally { setLoading(false); }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError(''); setCode(['', '', '', '', '', '']); setLoading(true);
    const fullPhone = `${selectedCountry.code}${phone.replace(/\D/g, '')}`;
    try {
      const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: fullPhone });
      if (error) { setError(error.message || 'Failed to resend OTP'); return; }
      setCooldown(COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP');
    } finally { setLoading(false); }
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
    setError('');
  }

  // ─── Google SSO handler ─────────────────────────────────────────────────
  async function handleGoogleLogin() {
    setLoading(true); setError('');
    const callbackURL = callbackPath
      ? `${window.location.origin}${callbackPath}`
      : loginMode === 'designer'
        ? `${window.location.origin}${DESIGNER_AUTH_CONTINUE_PATH}`
        : `${window.location.origin}${visitorPostLoginPath()}`;
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL });
      if (result?.error) setError('Couldn\'t sign in with Google');
    } catch { setError('Couldn\'t sign in with Google'); }
    finally { setLoading(false); }
  }

  // ─── Email OTP handlers (designer tab) ──────────────────────────────────
  async function handleEmailOtpSend() {
    if (!designerEmail.trim() || !designerEmail.includes('@')) {
      setError('Enter a valid email address'); return;
    }
    setError(''); setEmailMessage(''); setLoading(true);
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email: designerEmail.trim(),
        type: 'sign-in',
      });
      if (sendError) { setError(sendError.message ?? 'Failed to send code'); }
      else {
        setEmailOtpStep('otp');
        setEmailCooldown(COOLDOWN_SECONDS);
        setEmailMessage(`Code sent to ${designerEmail.trim()}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally { setLoading(false); }
  }

  async function handleEmailOtpVerify() {
    const otp = emailOtp.join('');
    if (otp.length !== 6) { setError('Enter the full 6-digit code'); return; }
    setError(''); setLoading(true);
    try {
      const { error: signInError } = await authClient.signIn.emailOtp({
        email: designerEmail.trim(),
        otp,
      });
      if (signInError) {
        setError(signInError.message ?? 'Invalid or expired code');
        setEmailOtp(['', '', '', '', '', '']);
      } else { setSuccess(true); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setEmailOtp(['', '', '', '', '', '']);
    } finally { setLoading(false); }
  }

  async function handleEmailOtpResend() {
    if (emailCooldown > 0) return;
    setError(''); setEmailOtp(['', '', '', '', '', '']); setLoading(true);
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email: designerEmail.trim(),
        type: 'sign-in',
      });
      if (sendError) { setError(sendError.message ?? 'Failed to resend code'); }
      else { setEmailCooldown(COOLDOWN_SECONDS); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally { setLoading(false); }
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
                  return (
                    <div key={f.title} data-testid={`feature-${f.title.toLowerCase().replace(/\s+/g, '-')}`} className="flex items-center gap-2.5">
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
                  <AvatarFallback className={cn('text-[9px] font-semibold text-white', a.className)}>{a.initials}</AvatarFallback>
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
        <div className="flex w-full min-w-0 flex-col px-6 py-8 md:flex-1">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-medium text-foreground">Login to continue</h3>
              {onClose && (
                <Button onClick={onClose} aria-label="Close" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <X className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <Tabs defaultValue={initialMode} value={loginMode} className="w-full" onValueChange={(val) => setLoginMode(val as LoginMode)}>
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

                <div className="relative mt-4 w-full overflow-hidden">
                  <div
                    className="flex w-[200%] transition-transform duration-300 ease-in-out"
                    style={{ transform: `translateX(${loginMode === 'browsing' ? '0%' : '-50%'})` }}
                  >
                    {/* ─── Browsing tab: Phone OTP + Google ─── */}
                    <div
                      className={cn('flex w-1/2 shrink-0 flex-col gap-3 transition-opacity duration-300', loginMode === 'browsing' ? 'opacity-100' : 'opacity-0')}
                      inert={loginMode !== 'browsing'}
                      aria-hidden={loginMode !== 'browsing'}
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset">
                          <DropdownMenu onOpenChange={(open) => { if (!open) setCountrySearch(''); }}>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className="inline-flex items-center gap-2 bg-muted px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50" disabled={loading}>
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
                                  onKeyDown={(e) => { if (e.key === 'Escape') { if (countrySearch) { e.preventDefault(); setCountrySearch(''); return; } return; } e.stopPropagation(); }}
                                  className="w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                  autoFocus
                                />
                              </div>
                              {filteredCountries.length > 0 ? (
                                filteredCountries.map((country) => (
                                  <DropdownMenuItem key={`${country.code}-${country.name}`} onSelect={() => setSelectedCountry(country)} className="gap-2">
                                    <span className="text-base leading-none">{country.flag}</span>
                                    <span className="text-muted-foreground">{country.code}</span>
                                    <span className="text-foreground">{country.name}</span>
                                  </DropdownMenuItem>
                                ))
                              ) : (
                                <div className="px-2 py-4 text-center text-xs text-muted-foreground">No countries found</div>
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
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSendOtp(); }}
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

                    {/* ─── Designer tab: Google SSO + Email OTP ─── */}
                    <div
                      className={cn('flex w-1/2 shrink-0 flex-col gap-4 transition-opacity duration-300', loginMode === 'designer' ? 'opacity-100' : 'opacity-0')}
                      inert={loginMode !== 'designer'}
                      aria-hidden={loginMode !== 'designer'}
                    >
                      <GoogleSignInButton label="Continue with Google" loading={loading} onClick={handleGoogleLogin} />

                      <OrSeparator className="my-2" />

                      {emailOtpStep === 'email' ? (
                        <>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="designer-email">Email</Label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                              <Input
                                id="designer-email"
                                type="email"
                                value={designerEmail}
                                onChange={(e) => { setDesignerEmail(e.target.value); setError(''); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleEmailOtpSend(); }}
                                placeholder="you@example.com"
                                className="pl-10 focus-visible:ring-inset focus-visible:ring-offset-0"
                                disabled={loading}
                                autoComplete="email"
                              />
                            </div>
                          </div>

                          <Button
                            type="button"
                            className="w-full cursor-pointer border border-white/10 bg-[#0e121b] text-white shadow-[0px_1px_2px_0px_rgba(27,28,29,0.48),0px_0px_0px_1px_#242628] [background-image:linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_100%)] hover:bg-[#0e121b]/90"
                            disabled={loading || !designerEmail.trim()}
                            onClick={handleEmailOtpSend}
                          >
                            {loading ? 'Sending…' : 'Continue'}
                          </Button>
                        </>
                      ) : (
                        <>
                          {emailMessage && (
                            <p className="rounded-md bg-green-50 p-2 text-center text-sm text-green-700">{emailMessage}</p>
                          )}

                          <OtpInput
                            value={emailOtp}
                            onChange={(v) => { setEmailOtp(v); setError(''); }}
                            onComplete={handleEmailOtpVerify}
                            disabled={loading}
                          />

                          <Button
                            type="button"
                            className="w-full cursor-pointer border border-white/10 bg-[#0e121b] text-white shadow-[0px_1px_2px_0px_rgba(27,28,29,0.48),0px_0px_0px_1px_#242628] [background-image:linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_100%)] hover:bg-[#0e121b]/90"
                            disabled={loading || emailOtp.some((d) => !d)}
                            onClick={handleEmailOtpVerify}
                          >
                            {loading ? 'Verifying…' : 'Verify'}
                          </Button>

                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <button
                              type="button"
                              className="text-primary underline-offset-2 hover:underline"
                              onClick={() => { setEmailOtpStep('email'); setError(''); setEmailMessage(''); setEmailOtp(['', '', '', '', '', '']); }}
                            >
                              Change email
                            </button>
                            <button
                              type="button"
                              onClick={handleEmailOtpResend}
                              disabled={emailCooldown > 0 || loading}
                              className="underline-offset-2 hover:underline disabled:no-underline disabled:opacity-50"
                            >
                              {emailCooldown > 0 ? `Resend in ${formatTimer(emailCooldown)}` : 'Resend code'}
                            </button>
                          </div>
                        </>
                      )}
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
            <Mail className="size-14 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="text-base text-muted-foreground">
            We've sent a code to{' '}
            <span className="font-medium text-foreground">
              {selectedCountry.code} {phone}
            </span>
          </p>
        </div>

        <OtpInput value={code} onChange={(v) => { setCode(v); setError(''); }} onComplete={handleVerify} disabled={loading} />

        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || loading}
          className="text-base text-muted-foreground underline-offset-2 hover:underline disabled:no-underline disabled:opacity-50"
        >
          {cooldown > 0 ? `Didn't get the code? Resend in ${formatTimer(cooldown)}` : "Didn't get the code? Resend"}
        </button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex w-full gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={() => { setStep('phone'); setError(''); setCode(['', '', '', '', '', '']); }}>
            Cancel
          </Button>
          <Button type="button" onClick={handleVerify} disabled={loading || code.some((d) => !d)} className="flex-1">
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
