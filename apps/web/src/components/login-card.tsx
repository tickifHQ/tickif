'use client';

import { typography } from '@repo/ui/lib/typography';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Asterisk, Bookmark, Calendar, House, Mail, MessageSquare, Users, X } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/utils';
import { Card } from '@repo/ui/components/card';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Separator } from '@repo/ui/components/separator';
import { Tabs, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
import { VisitorLoginContinuation } from '@/components/visitor-login-continuation';
import { OtpInput } from '@/components/otp-input';
import { OtpVerificationPanel } from '@/components/otp-verification-panel';
import { GoogleBrandIcon } from '@/components/brand-icons';
import {
  countries,
  PhoneNumberInput,
  toE164PhoneNumber,
  type Country,
} from '@/components/phone-number-input';
import { DESIGNER_AUTH_CONTINUE_PATH } from '@/lib/auth-paths';
import { useLandingProjectPreviews } from '@/components/landing-project-preview';

type LoginMode = 'browsing' | 'designer';

interface LoginCardProps {
  presentation?: 'default' | 'landing';
  initialMode?: LoginMode;
  callbackPath?: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

type Step = 'phone' | 'otp';
type OtpDigits = string[];

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
    <Button
      variant="outline"
      shape="rounded"
      className={cn(
        typography.labelLg,
        'h-12 w-full cursor-pointer border-auth-field-border bg-card text-base shadow-(--auth-field-shadow) md:h-10 md:text-sm md:leading-[18px] md:tracking-[-0.002em]',
      )}
      disabled={loading}
      onClick={onClick}
    >
      <GoogleBrandIcon className="size-5 shrink-0" />
      {label}
    </Button>
  );
}

function OrSeparator({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Separator />
      <span
        className={cn(
          typography.bodyXs,
          'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-muted-foreground',
        )}
      >
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
  { icon: Mail, title: 'Send enquiries to designers' },
] as const;

const designerFeatures = [
  { icon: Bookmark, title: 'Share your work anywhere' },
  { icon: MessageSquare, title: 'Get enquiries from homeowners' },
  { icon: Calendar, title: 'Turn visitors into clients' },
] as const;

export function LoginCard({
  presentation = 'default',
  initialMode = 'browsing',
  callbackPath,
  onSuccess,
  onClose,
}: LoginCardProps) {
  const previewProjects = useLandingProjectPreviews();
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
  const handleClose = onClose ?? (() => router.push('/'));

  // Email OTP state (designer tab)
  const [designerEmail, setDesignerEmail] = useState('');
  const [emailOtpStep, setEmailOtpStep] = useState<'email' | 'otp'>('email');
  const [emailOtp, setEmailOtp] = useState<OtpDigits>(['', '', '', '', '', '']);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [emailMessage, setEmailMessage] = useState('');

  const features = loginMode === 'designer' ? designerFeatures : browsingFeatures;
  const promoSubtitle =
    loginMode === 'designer'
      ? 'One link to share your work, get discovered, and turn views into real enquiries.'
      : 'Save the homes you love, message designers, and send enquiries directly.';

  const cooldownRef = useRef(cooldown);
  cooldownRef.current = cooldown;
  const emailCooldownRef = useRef(emailCooldown);
  emailCooldownRef.current = emailCooldown;

  useEffect(() => {
    if (!success || loginMode === 'browsing') return;
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
    window.location.href = DESIGNER_AUTH_CONTINUE_PATH;
  }, [success, loginMode, callbackPath, onSuccess]);

  // Phone OTP cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      if (cooldownRef.current <= 1) {
        clearInterval(id);
        setCooldown(0);
      } else setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown > 0]);

  // Email OTP cooldown
  useEffect(() => {
    if (emailCooldown <= 0) return;
    const id = setInterval(() => {
      if (emailCooldownRef.current <= 1) {
        clearInterval(id);
        setEmailCooldown(0);
      } else setEmailCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [emailCooldown > 0]);

  // ─── Phone OTP handlers ─────────────────────────────────────────────────
  async function handleSendOtp() {
    const fullPhone = toE164PhoneNumber(selectedCountry, phone);
    if (!fullPhone) {
      setError(`Enter a valid phone number for ${selectedCountry.name}`);
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
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    const fullPhone = toE164PhoneNumber(selectedCountry, phone);
    if (!fullPhone) {
      setError(`Enter a valid phone number for ${selectedCountry.name}`);
      return;
    }
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
      setError(err instanceof Error ? err.message : 'Invalid or expired OTP');
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
    const fullPhone = toE164PhoneNumber(selectedCountry, phone);
    if (!fullPhone) {
      setError(`Enter a valid phone number for ${selectedCountry.name}`);
      setLoading(false);
      return;
    }
    try {
      const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: fullPhone });
      if (error) {
        setError(error.message || 'Failed to resend OTP');
        return;
      }
      setCooldown(COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  }

  function handleCancelOtp() {
    setStep('phone');
    setError('');
    setCode(['', '', '', '', '', '']);
  }

  // ─── Google SSO handler ─────────────────────────────────────────────────
  async function handleGoogleLogin() {
    setLoading(true);
    setError('');
    const callbackURL = callbackPath
      ? `${window.location.origin}${callbackPath}`
      : `${window.location.origin}${DESIGNER_AUTH_CONTINUE_PATH}`;
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL });
      if (result?.error) setError("Couldn't sign in with Google");
    } catch {
      setError("Couldn't sign in with Google");
    } finally {
      setLoading(false);
    }
  }

  // ─── Email OTP handlers (designer tab) ──────────────────────────────────
  async function handleEmailOtpSend() {
    if (!designerEmail.trim() || !designerEmail.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setEmailMessage('');
    setLoading(true);
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email: designerEmail.trim(),
        type: 'sign-in',
      });
      if (sendError) {
        setError(sendError.message ?? 'Failed to send code');
      } else {
        setEmailOtpStep('otp');
        setEmailCooldown(COOLDOWN_SECONDS);
        setEmailMessage(`Code sent to ${designerEmail.trim()}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailOtpVerify() {
    const otp = emailOtp.join('');
    if (otp.length !== 6) {
      setError('Enter the full 6-digit code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { error: signInError } = await authClient.signIn.emailOtp({
        email: designerEmail.trim(),
        otp,
      });
      if (signInError) {
        setError(signInError.message ?? 'Invalid or expired code');
        setEmailOtp(['', '', '', '', '', '']);
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setEmailOtp(['', '', '', '', '', '']);
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailOtpResend() {
    if (emailCooldown > 0) return;
    setError('');
    setEmailOtp(['', '', '', '', '', '']);
    setLoading(true);
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email: designerEmail.trim(),
        type: 'sign-in',
      });
      if (sendError) {
        setError(sendError.message ?? 'Failed to resend code');
      } else {
        setEmailCooldown(COOLDOWN_SECONDS);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  }

  if (success && loginMode === 'browsing') {
    return <VisitorLoginContinuation callbackPath={callbackPath} onSuccess={onSuccess} />;
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
      <div className="relative flex flex-col overflow-hidden md:flex-row">
        {/* Left: Brand / Promo Panel */}
        {presentation === 'landing' ? (
          <div className="relative flex flex-col justify-between gap-3 overflow-hidden rounded-card bg-linear-to-br from-surface-inverse to-secondary-foreground p-5 text-surface-inverse-foreground md:w-[42%] md:shrink-0 md:gap-5 md:px-8 md:pb-7 md:pt-8 lg:w-[404px]">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-48 left-40 size-[420px] rounded-full bg-primary/10"
            />
            <p
              className={cn(
                typography.labelSm,
                'relative flex w-fit items-center gap-2 rounded-full bg-primary/15 px-3 py-2 text-primary-soft',
              )}
            >
              <Bookmark className="size-3.5" aria-hidden /> Keep your favourite homes close
            </p>
            <h2
              className={cn(
                typography.headingH2,
                'relative text-2xl leading-7 md:text-[32px] md:leading-[38px]',
              )}
            >
              Don’t lose the homes you lingered on
            </h2>
            {previewProjects?.length ? (
              <div
                className="relative hidden gap-2 md:flex"
                aria-label="Explore these published homes"
              >
                {previewProjects.map((project) => (
                  <img
                    key={project.id}
                    src={project.coverImageUrl!}
                    alt={project.title}
                    width={80}
                    height={100}
                    loading="lazy"
                    className="h-[100px] min-w-0 flex-1 rounded-lg object-cover"
                  />
                ))}
              </div>
            ) : null}
            <p className={cn(typography.bodySm, 'relative text-surface-inverse-foreground/75')}>
              Save homes you love and connect with their designers. Your next idea is worth keeping.
            </p>
            <div
              className={cn(
                typography.monoXs,
                'relative hidden border-t border-primary-soft/25 pt-3 uppercase text-primary-soft md:block',
              )}
            >
              Save your favourites · Find your designer
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col justify-between gap-4 rounded-xl bg-auth-welcome px-5 py-5 text-surface-inverse-foreground md:my-1 md:ml-1 md:w-[315px] md:shrink-0 md:px-6 md:py-8">
            <div className="flex flex-col gap-3 md:gap-5">
              <div className="order-last flex w-fit items-center gap-1.5 text-primary-soft md:order-none md:rounded md:bg-success/10 md:px-2 md:py-0.5">
                <Users className="size-3.5 shrink-0" aria-hidden="true" />
                <span className={typography.labelSm}>Discover real homes and their designers</span>
              </div>
              <div className="flex flex-col gap-2">
                <h2
                  className={cn(
                    typography.headingH2,
                    'pr-10 text-[28px] leading-8 md:pr-0 md:text-[32px] md:leading-[38px]',
                  )}
                >
                  Welcome to Tickif
                </h2>
                <p
                  className={cn(typography.bodySm, 'text-surface-inverse-foreground/75 md:hidden')}
                >
                  {loginMode === 'designer'
                    ? 'Your work deserves to be discovered.'
                    : 'Keep your favourite homes close.'}
                </p>
                <p
                  className={cn(
                    typography.bodySm,
                    'hidden text-surface-inverse-foreground/75 md:block',
                  )}
                >
                  {promoSubtitle}
                </p>
                <div className="mt-6 hidden flex-col gap-3 md:flex">
                  {features.map((f) => {
                    const Icon = f.icon;
                    return (
                      <div
                        key={f.title}
                        data-testid={`feature-${f.title.toLowerCase().replace(/\s+/g, '-')}`}
                        className="flex items-center gap-2.5"
                      >
                        <Icon className="size-4 shrink-0 text-primary-soft" aria-hidden="true" />
                        <p className={typography.labelMd}>{f.title}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <p
              className={cn(
                typography.body2xs,
                'mt-6 hidden text-surface-inverse-foreground/75 md:block',
              )}
            >
              Explore published projects · Connect with designers
            </p>
          </div>
        )}

        {/* Right: Form Panel */}
        <div
          className={cn(
            'flex w-full min-w-0 flex-col px-5 py-5 md:flex-1 md:py-8',
            presentation === 'landing' ? 'md:px-8 md:min-h-[460px]' : 'md:px-6',
          )}
        >
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className={cn(typography.headingH4, 'text-foreground')}>
                  {presentation === 'landing' ? 'Log in to keep exploring' : 'Login to continue'}
                </h3>
                {presentation === 'landing' ? (
                  <p className={cn(typography.bodySm, 'mt-2 text-muted-foreground')}>
                    Free for homeowners. Just your mobile number.
                  </p>
                ) : null}
              </div>
              <Button
                onClick={handleClose}
                aria-label="Close"
                variant="ghost"
                size="icon"
                className={cn(
                  'size-11 shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground md:size-8',
                  presentation === 'default' &&
                    'absolute right-3 top-3 z-10 text-primary-soft hover:bg-surface-inverse hover:text-surface-inverse-foreground md:static md:z-auto md:text-muted-foreground md:hover:bg-accent md:hover:text-foreground',
                )}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="flex flex-col gap-4">
              <Tabs
                defaultValue={initialMode}
                value={loginMode}
                className="w-full"
                onValueChange={(val) => setLoginMode(val as LoginMode)}
              >
                <TabsList className="h-14 w-full rounded-lg p-1.5 md:h-11 [&>button]:rounded-md">
                  <TabsTrigger
                    value="browsing"
                    className={cn(
                      typography.labelMd,
                      'min-w-0 flex-1 flex-col gap-1 px-2 focus-visible:ring-inset focus-visible:ring-offset-0 md:flex-row md:gap-1.5',
                    )}
                  >
                    <House className="size-4" aria-hidden="true" />
                    I'm browsing
                  </TabsTrigger>
                  <TabsTrigger
                    value="designer"
                    className={cn(
                      typography.labelMd,
                      'min-w-0 flex-1 flex-col gap-1 px-2 focus-visible:ring-inset focus-visible:ring-offset-0 md:flex-row md:gap-1.5',
                    )}
                  >
                    <Asterisk className="size-4" aria-hidden="true" />
                    I'm a designer
                  </TabsTrigger>
                </TabsList>

                <div className="relative mt-4 w-full">
                  <div>
                    {/* ─── Browsing tab: Phone OTP ─── */}
                    <div
                      className={cn(
                        'w-full flex-col gap-3',
                        loginMode === 'browsing' ? 'flex' : 'hidden',
                      )}
                      hidden={loginMode !== 'browsing'}
                      inert={loginMode !== 'browsing'}
                      aria-hidden={loginMode !== 'browsing'}
                    >
                      <div className="flex flex-col gap-1.5">
                        <PhoneNumberInput
                          id="phone"
                          phone={phone}
                          selectedCountry={selectedCountry}
                          onPhoneChange={(value) => {
                            setPhone(value);
                            setError('');
                          }}
                          onSelectedCountryChange={(country) => {
                            setSelectedCountry(country);
                            setError('');
                          }}
                          onEnter={handleSendOtp}
                          placeholder={presentation === 'landing' ? 'Mobile number' : '9123456789'}
                          disabled={loading}
                          inputClassName={cn(typography.bodyMd, 'h-13 md:h-11 md:text-base')}
                          wrapperClassName="rounded-lg border-auth-field-border bg-card shadow-(--auth-field-shadow)"
                          countryButtonClassName="min-h-13 border-auth-field-divider bg-transparent text-base md:min-h-11 md:text-sm"
                        />
                      </div>

                      <Button
                        type="button"
                        variant={presentation === 'landing' ? 'default' : 'fancy'}
                        size="fancy"
                        onClick={handleSendOtp}
                        disabled={loading || !toE164PhoneNumber(selectedCountry, phone)}
                        className={cn(
                          typography.labelLg,
                          'h-12 w-full cursor-pointer md:h-10',
                          presentation === 'landing' && 'h-12 rounded-full',
                        )}
                      >
                        {loading ? 'Sending…' : 'Get OTP'}
                      </Button>
                    </div>

                    {/* ─── Designer tab: Google SSO + Email OTP ─── */}
                    <div
                      className={cn(
                        'w-full flex-col gap-4',
                        loginMode === 'designer' ? 'flex' : 'hidden',
                      )}
                      hidden={loginMode !== 'designer'}
                      inert={loginMode !== 'designer'}
                      aria-hidden={loginMode !== 'designer'}
                    >
                      <GoogleSignInButton
                        label="Continue with Google"
                        loading={loading}
                        onClick={handleGoogleLogin}
                      />

                      <OrSeparator className="my-2" />

                      {emailOtpStep === 'email' ? (
                        <>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="designer-email">Email</Label>
                            <div className="relative">
                              <Mail
                                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <Input
                                id="designer-email"
                                type="email"
                                value={designerEmail}
                                onChange={(e) => {
                                  setDesignerEmail(e.target.value);
                                  setError('');
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleEmailOtpSend();
                                }}
                                placeholder="you@example.com"
                                className={cn(
                                  typography.bodyMd,
                                  'h-13 border-auth-field-border pl-10 shadow-(--auth-field-shadow) hover:border-border-strong focus-visible:ring-inset focus-visible:ring-offset-0 md:h-10 md:text-base',
                                )}
                                disabled={loading}
                                autoComplete="email"
                              />
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="fancy"
                            size="fancy"
                            className={cn(
                              typography.labelLg,
                              'h-12 w-full cursor-pointer text-base md:h-10 md:text-sm md:leading-[18px] md:tracking-[-0.002em]',
                            )}
                            disabled={loading || !designerEmail.trim()}
                            onClick={handleEmailOtpSend}
                          >
                            {loading ? 'Sending…' : 'Login'}
                          </Button>
                        </>
                      ) : (
                        <>
                          {emailMessage && (
                            <p className="rounded-md bg-green-50 p-2 text-center text-sm text-green-700">
                              {emailMessage}
                            </p>
                          )}

                          <OtpInput
                            value={emailOtp}
                            onChange={(v) => {
                              setEmailOtp(v);
                              setError('');
                            }}
                            onComplete={handleEmailOtpVerify}
                            disabled={loading}
                          />

                          <Button
                            type="button"
                            variant="fancy"
                            size="fancy"
                            className={cn(
                              typography.labelLg,
                              'h-12 w-full cursor-pointer text-base md:h-10 md:text-sm md:leading-[18px] md:tracking-[-0.002em]',
                            )}
                            disabled={loading || emailOtp.some((d) => !d)}
                            onClick={handleEmailOtpVerify}
                          >
                            {loading ? 'Verifying…' : 'Verify'}
                          </Button>

                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <button
                              type="button"
                              className="text-primary underline-offset-2 hover:underline"
                              onClick={() => {
                                setEmailOtpStep('email');
                                setError('');
                                setEmailMessage('');
                                setEmailOtp(['', '', '', '', '', '']);
                              }}
                            >
                              Change email
                            </button>
                            <button
                              type="button"
                              onClick={handleEmailOtpResend}
                              disabled={emailCooldown > 0 || loading}
                              className="underline-offset-2 hover:underline disabled:no-underline disabled:opacity-50"
                            >
                              {emailCooldown > 0
                                ? `Resend in ${formatTimer(emailCooldown)}`
                                : 'Resend code'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

                  <p className={cn(typography.bodyXs, 'mt-5 text-center text-muted-foreground')}>
                    By continuing you agree to Tickif's{' '}
                    <Link
                      href="/company/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground underline underline-offset-4"
                    >
                      Terms
                    </Link>{' '}
                    and acknowledge our{' '}
                    <Link
                      href="/company/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground underline underline-offset-4"
                    >
                      Privacy
                    </Link>{' '}
                    notice.
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
      <OtpVerificationPanel
        code={code}
        sentTo={`${selectedCountry.code} ${phone}`}
        onCodeChange={(value) => {
          setCode(value);
          setError('');
        }}
        onVerify={handleVerify}
        onResend={handleResend}
        onCancel={handleCancelOtp}
        loading={loading}
        resendDisabled={cooldown > 0}
        resendLabel={cooldown > 0 ? `Resend in ${formatTimer(cooldown)}` : 'Resend'}
        verifyLabel="Continue"
        error={error}
      />
    );
  }

  return (
    <Card
      className={cn(
        'mx-auto w-full overflow-hidden',
        step === 'otp'
          ? 'max-w-[33.8125rem] shadow-xl'
          : presentation === 'landing'
            ? 'max-w-[862px] rounded-card p-2 shadow-floating-card'
            : 'max-w-[760px]',
      )}
    >
      {step === 'otp' ? renderOtpStep() : renderPhoneStep()}
    </Card>
  );
}
