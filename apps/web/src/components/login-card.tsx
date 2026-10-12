'use client';

import { typography } from '@repo/ui/lib/typography';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  Bookmark,
  Calendar,
  House,
  Mail,
  MessageSquare,
  Ruler,
  Users,
  X,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import type { FeedProject } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/utils';
import { Card } from '@repo/ui/components/card';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Separator } from '@repo/ui/components/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
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
      type="button"
      variant="outline"
      size="lg"
      shape="rounded"
      className="w-full cursor-pointer border-auth-field-border bg-card shadow-(--auth-field-shadow)"
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

function LoginWelcomePanel({
  presentation,
  loginMode,
  projects,
}: {
  presentation: 'default' | 'landing';
  loginMode: LoginMode;
  projects?: FeedProject[];
}) {
  const landing = presentation === 'landing';
  const features = loginMode === 'designer' ? designerFeatures : browsingFeatures;
  return (
    <aside
      data-slot="login-welcome"
      className="relative flex w-full flex-col justify-between gap-6 overflow-hidden rounded-card bg-auth-welcome p-6 text-surface-inverse-foreground md:w-5/12 md:shrink-0 md:p-8"
    >
      <img
        src="/ui/visitor-welcome/glow.svg"
        alt=""
        width={420}
        height={420}
        className="pointer-events-none absolute -left-40 -top-44"
      />
      <div className="relative flex flex-col gap-5">
        <Badge
          variant="outline"
          className={cn(
            typography.labelSm,
            'w-fit gap-2 whitespace-normal border-transparent bg-primary/20 text-surface-inverse-foreground',
            !landing && 'order-last md:order-none',
          )}
        >
          {landing ? (
            <Bookmark className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Users className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          {landing ? 'Keep your favourite homes close' : 'Discover real homes and their designers'}
        </Badge>
        <div className="flex flex-col gap-3">
          <h2 className="pr-10 font-display text-2xl font-medium leading-tight tracking-tight md:pr-0 md:text-section">
            {landing ? 'Don’t lose the homes you lingered on' : 'Welcome to Tickif'}
          </h2>
          {!landing && (
            <p className={cn(typography.bodySm, 'text-surface-inverse-foreground/65 md:hidden')}>
              {loginMode === 'designer'
                ? 'Your work deserves to be discovered.'
                : 'Keep your favourite homes close.'}
            </p>
          )}
          <p
            className={cn(
              typography.bodySm,
              'text-surface-inverse-foreground/65',
              !landing && 'hidden md:block',
            )}
          >
            {landing
              ? 'Save homes you love and connect with their designers. Your next idea is worth keeping.'
              : loginMode === 'designer'
                ? 'One link to share your work, get discovered, and turn views into real enquiries.'
                : 'Save the homes you love, message designers, and send enquiries directly.'}
          </p>
        </div>
        {landing && projects?.length ? (
          <div className="hidden gap-2 md:flex" aria-label="Explore these published homes">
            {projects.map((project) => (
              <img
                key={project.id}
                src={project.coverImageUrl!}
                alt={project.title}
                width={80}
                height={100}
                loading="lazy"
                className="h-24 min-w-0 flex-1 rounded-lg object-cover"
              />
            ))}
          </div>
        ) : !landing ? (
          <ul className="hidden flex-col gap-5 md:flex">
            {features.map(({ icon: Icon, title }) => (
              <li
                key={title}
                data-testid={`feature-${title.toLowerCase().replace(/\s+/g, '-')}`}
                className="flex items-center gap-3 text-sm"
              >
                <Icon className="size-4 shrink-0 text-primary-soft" aria-hidden="true" />
                {title}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="relative hidden text-xs leading-5 text-surface-inverse-foreground/65 md:block">
        Explore published projects · Connect with designers
      </p>
    </aside>
  );
}

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
  const verifyInFlight = useRef(false);
  const [loginMode, setLoginMode] = useState<LoginMode>(initialMode);
  const handleClose = onClose ?? (() => router.push('/'));

  // Email OTP state (designer tab)
  const [designerEmail, setDesignerEmail] = useState('');
  const [emailOtpStep, setEmailOtpStep] = useState<'email' | 'otp'>('email');
  const [emailOtp, setEmailOtp] = useState<OtpDigits>(['', '', '', '', '', '']);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [emailMessage, setEmailMessage] = useState('');

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

  async function handleVerify(digits = code) {
    if (verifyInFlight.current || loading) return;
    const fullPhone = toE164PhoneNumber(selectedCountry, phone);
    if (!fullPhone) {
      setError(`Enter a valid phone number for ${selectedCountry.name}`);
      return;
    }
    const otp = digits.join('');
    if (otp.length !== 6) {
      setError('Enter the full 6-digit OTP');
      return;
    }
    setError('');
    verifyInFlight.current = true;
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
      verifyInFlight.current = false;
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
      <>
        {/* Right: Form Panel */}
        <div className="flex w-full min-w-0 flex-col p-5 sm:p-8 md:flex-1">
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
                type="button"
                onClick={handleClose}
                aria-label="Close"
                variant="ghost"
                size="icon"
                className={cn(
                  'size-11 shrink-0 md:size-8',
                  presentation === 'default' &&
                    'absolute right-3 top-3 z-10 text-primary-soft md:static md:text-muted-foreground',
                )}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="flex flex-col gap-4">
              <Tabs
                defaultValue={initialMode}
                value={loginMode}
                className="w-full gap-5"
                onValueChange={(val) => setLoginMode(val as LoginMode)}
              >
                <TabsList className="grid h-14 w-full grid-cols-2 rounded-lg p-1 md:h-11">
                  <TabsTrigger
                    value="browsing"
                    className={cn(
                      typography.labelMd,
                      'min-h-12 min-w-0 gap-1.5 rounded-md px-1 text-xs/4.5 focus-visible:ring-inset focus-visible:ring-offset-0 sm:px-3 sm:text-sm/4.5 md:min-h-0',
                    )}
                  >
                    <House className="size-4" aria-hidden="true" />
                    I'm browsing
                  </TabsTrigger>
                  <TabsTrigger
                    value="designer"
                    className={cn(
                      typography.labelMd,
                      'min-h-12 min-w-0 gap-1.5 rounded-md px-1 text-xs/4.5 focus-visible:ring-inset focus-visible:ring-offset-0 sm:px-3 sm:text-sm/4.5 md:min-h-0',
                    )}
                  >
                    <Ruler className="size-4" aria-hidden="true" />
                    I'm a designer
                  </TabsTrigger>
                </TabsList>

                <div className="flex min-w-0 flex-col gap-4">
                  {/* ─── Browsing tab: Phone OTP ─── */}
                  <TabsContent value="browsing" className="flex min-w-0 flex-col gap-3">
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
                      size="lg"
                      onClick={handleSendOtp}
                      disabled={loading || !toE164PhoneNumber(selectedCountry, phone)}
                      className={cn(typography.labelLg, 'w-full cursor-pointer')}
                    >
                      {loading ? 'Sending…' : 'Get OTP'}
                      <ArrowRight data-icon="inline-end" aria-hidden="true" />
                    </Button>
                  </TabsContent>

                  {/* ─── Designer tab: Google SSO + Email OTP ─── */}
                  <TabsContent value="designer" className="flex min-w-0 flex-col gap-4">
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
                              className="border-auth-field-border pl-10 shadow-(--auth-field-shadow) hover:border-auth-field-border focus-visible:ring-inset focus-visible:ring-offset-0"
                              disabled={loading}
                              autoComplete="email"
                            />
                          </div>
                        </div>

                        <Button
                          type="button"
                          size="lg"
                          className="w-full cursor-pointer"
                          disabled={loading || !designerEmail.trim()}
                          onClick={handleEmailOtpSend}
                        >
                          {loading ? 'Sending…' : 'Login'}
                        </Button>
                      </>
                    ) : (
                      <>
                        {emailMessage && (
                          <p
                            role="status"
                            className="rounded-md bg-success-lighter p-2 text-center text-sm text-success"
                          >
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
                          size="lg"
                          className="w-full cursor-pointer"
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
                  </TabsContent>

                  {error && (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <p className={cn(typography.bodyXs, 'text-center text-muted-foreground')}>
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
      </>
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
        onClose={handleClose}
        presentation="login"
        loading={loading}
        resendDisabled={cooldown > 0}
        resendLabel={cooldown > 0 ? `Resend in ${formatTimer(cooldown)}` : 'Resend'}
        verifyLabel="Continue"
        error={error}
      />
    );
  }

  return (
    <Card className="relative mx-auto w-full max-w-4xl gap-0 p-2 shadow-floating-card">
      <div className="flex min-w-0 flex-col md:flex-row">
        <LoginWelcomePanel
          presentation={presentation}
          loginMode={loginMode}
          projects={previewProjects}
        />
        {step === 'otp' ? renderOtpStep() : renderPhoneStep()}
      </div>
    </Card>
  );
}
