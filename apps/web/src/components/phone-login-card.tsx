'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Input } from '@repo/ui/components/input';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';

type Step = 'phone' | 'otp';
type OtpDigits = string[];

const COUNTRY_CODE = '+91';
const COOLDOWN_SECONDS = 30;

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PhoneLoginCard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState<OtpDigits>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [success, setSuccess] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (success) {
      router.push('/');
    }
  }, [success, router]);

  useEffect(() => {
    if (step === 'otp') {
      inputRefs.current[0]?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const validatePhone = useCallback((value: string): string | null => {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 10) return 'Enter a valid 10-digit phone number';
    return null;
  }, []);

  async function handleSendOtp() {
    const fullPhone = `${COUNTRY_CODE}${phone.replace(/\D/g, '')}`;
    const validationError = validatePhone(phone);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setLoading(true);
    try {
      await authClient.phoneNumber.sendOtp({ phoneNumber: fullPhone });
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
    const fullPhone = `${COUNTRY_CODE}${phone.replace(/\D/g, '')}`;
    const otp = code.join('');
    if (otp.length !== 6) {
      setError('Enter the full 6-digit OTP');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await authClient.phoneNumber.verify({ phoneNumber: fullPhone, code: otp });
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
    const fullPhone = `${COUNTRY_CODE}${phone.replace(/\D/g, '')}`;
    try {
      await authClient.phoneNumber.sendOtp({ phoneNumber: fullPhone });
      setCooldown(COOLDOWN_SECONDS);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resend OTP';
      setError(message);
    }
  }

  function handleOtpChange(index: number, value: string) {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').split('').slice(0, 6);
      const next = [...code] as OtpDigits;
      for (let i = 0; i < 6; i++) {
        next[i] = pasted[i] ?? '';
      }
      setCode(next);
      const lastIndex = Math.min(pasted.length, 5);
      inputRefs.current[lastIndex]?.focus();
      return;
    }

    const digit = value.replace(/\D/g, '');
    if (digit && digit !== code[index]) {
      const next = [...code] as OtpDigits;
      next[index] = digit;
      setCode(next);
      if (index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const next = [...code] as OtpDigits;
      next[index - 1] = '';
      setCode(next);
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter' && code.every((d) => d)) {
      handleVerify();
    }
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
    setError('');
  }

  if (success) {
    return (
      <Card className="p-8 text-center">
        <p className="text-lg font-medium text-green-700">Signed in</p>
        <p className="mt-1 text-sm text-neutral-500">Redirecting…</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {step === 'phone' ? (
        <>
          <div>
            <label className="text-sm font-medium text-neutral-700" htmlFor="phone">
              Phone number
            </label>
            <div className="mt-1 flex">
              <span className="inline-flex items-center rounded-l-md border border-r-0 bg-neutral-50 px-3 text-sm text-neutral-500">
                +91
              </span>
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="button"
            onClick={handleSendOtp}
            disabled={loading || phone.length < 10}
            className="w-full"
          >
            {loading ? 'Sending OTP…' : 'Send OTP'}
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[260px]">
          <div className="flex flex-col items-center">
            <label className="text-sm font-medium text-neutral-700">
              Enter OTP
            </label>
            <p className="mt-0.5 text-xs text-neutral-500">
              Sent to +91 {phone}
            </p>

            <div className="mt-3 flex justify-center gap-2">
              {code.map((digit, i) => (
                <Input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  onFocus={(e) => e.target.select()}
                  className="size-10 text-center"
                  disabled={loading}
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                className="text-xs text-neutral-500 underline-offset-2 hover:underline disabled:no-underline disabled:opacity-50 py-2"
              >
                {cooldown > 0
                  ? `Resend in ${formatTimer(cooldown)}`
                  : 'Resend OTP'}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="button"
            onClick={handleVerify}
            disabled={loading || code.some((d) => !d)}
            className="w-full mt-6"
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
              className="w-full text-center text-xs text-neutral-500 underline-offset-2 hover:underline mt-4 py-2"
            >
              Change phone number
            </button>
          </div>
          )}
      </div>
    </Card>
  );
}
