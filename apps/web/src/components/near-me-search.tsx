'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LocateFixed, Loader2 } from 'lucide-react';
import { nearbyLocationResponseSchema, errorResponseSchema } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@repo/ui/components/dialog';
import { api } from '@/lib/api';

/** Device coordinates stay in this interaction; only a canonical city enters the URL. */
export function NearMeSearch({ basePath = '/', query }: { basePath?: string; query?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(0);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      operation.current += 1;
      controller.current?.abort();
    },
    [],
  );

  function close() {
    operation.current += 1;
    controller.current?.abort();
    pending.current = false;
    setBusy(false);
    setOpen(false);
  }

  async function locate() {
    if (pending.current) return;
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser. Choose a city instead.');
      return;
    }
    const version = ++operation.current;
    const current = () => operation.current === version;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 20000,
          maximumAge: 60000,
        });
      }).catch((reason: GeolocationPositionError) => {
        if (reason.code === 1) {
          throw new Error(
            'Location permission was denied. Allow location in your browser site settings and try again, or choose a city.',
          );
        }
        if (reason.code === 3) {
          throw new Error(
            'Finding your location timed out. Check your connection and try again, or choose a city.',
          );
        }
        throw new Error(
          'Your device could not determine its location. Turn on location services in your device settings and allow location for this browser, or choose a city.',
        );
      });
      if (!current()) return;
      controller.current = new AbortController();
      const response = await api.api.taxonomy.locations.nearby.$post(
        {
          json: {
            latitude: Number(position.coords.latitude.toFixed(2)),
            longitude: Number(position.coords.longitude.toFixed(2)),
          },
        },
        { init: { signal: controller.current.signal } },
      );
      const payload: unknown = await response.json();
      if (!current()) return;
      if (!response.ok) {
        const parsedError = errorResponseSchema.safeParse(payload);
        throw new Error(
          parsedError.success
            ? parsedError.data.error.message
            : 'Could not find your city. Try choosing it manually.',
        );
      }
      const parsed = nearbyLocationResponseSchema.safeParse(payload);
      if (!parsed.success) throw new Error('Could not read your city. Try choosing it manually.');
      const params = new URLSearchParams(searchParams.toString());
      if (query !== undefined) {
        const term = query.trim().slice(0, 200);
        if (term) params.set('q', term);
        else params.delete('q');
      }
      params.set('city', parsed.data.city.slug);
      params.delete('locality');
      params.delete('page');
      if (basePath === '/home') params.set('feed', 'custom');
      setOpen(false);
      router.push(`${basePath}?${params.toString()}`);
    } catch (reason) {
      if (current())
        setError(
          reason instanceof Error
            ? reason.message
            : 'Near me is unavailable. Choose a city instead.',
        );
    } finally {
      if (current()) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label="Near me"
        title="Find projects near me"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        <LocateFixed aria-hidden className="size-4" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Find projects near me</DialogTitle>
            <DialogDescription>
              Use your device location to find projects in your city. Tickif sends an approximate
              location to Google Maps to identify the city. Your location is not saved. Results are
              city-wide, rather than sorted by distance.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {busy ? (
            <p role="status" className="text-sm text-muted-foreground">
              Finding your city…
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Choose a city instead
            </Button>
            <Button type="button" disabled={busy} onClick={() => void locate()}>
              {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Use my location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
