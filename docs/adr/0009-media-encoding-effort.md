# ADR 0009 — Bound AVIF encoding effort

Status: Proposed
Date: 2026-10-11
Supersedes: None; supplements [ADR 0002](./0002-media-pipeline.md) and [ADR 0005](./0005-tickif-image-signatures.md)
Superseded by: None

## Context

Feedback E-373 requests shorter image processing/loading time as well as stable
upload progress and prompt previews. The existing plan generates five responsive
sizes in both WebP and AVIF, watermarked and signed, before marking an image Ready.
AVIF quality 65 used Sharp's implicit CPU effort 4. Removing the preview's wait for
sibling uploads improves responsiveness but does not accelerate this worker stage.

A native staging upload on revision `9673f1ab` persisted a 4000 x 3000 landscape
and a 3000 x 4000 portrait at Ready approximately 95 and 150 seconds after their
rows were created. Those intervals include transfer, commit, queue and processing;
successful jobs were removed, so actual processor duration could not be isolated.
Both inputs were synthetic high-entropy QA JPEGs, rather than representative
customer photographs. The staging worker had a 2 CPU quota and 2 GiB memory limit.

A local single-process probe isolated xlarge encoding at the same quality:

| Input | AVIF effort 4 | AVIF effort 2 | Encoded bytes at effort 4 / 2 |
| --- | --- | --- | --- |
| Landscape 2560 x 1920 | 26.061 s | 2.258 s | 1,736,704 / 1,724,901 |
| Portrait 2560 x 3413 | 34.390 s | 4.096 s | 3,681,245 / 3,667,930 |

The probe used Sharp 0.35.5 with one libvips thread, excluded watermark/signature
and storage operations, and was a single pass on local hardware. It establishes
a codec CPU-cost opportunity, not a staging speedup or general quality guarantee.
[Sharp documents AVIF effort](https://sharp.pixelplumbing.com/api-output/#avif)
as CPU effort, with smaller values favoring speed.

## Decision

Make AVIF effort explicitly 2 while retaining quality 65, all five variant sizes,
both formats, original privacy, watermark treatment and Tickif signature. WebP
quality stays 88. Keep asynchronous derivation, idempotency and Ready-after-all-
derivatives semantics. Do not change worker resources or concurrency as part of
this correction. Do not reduce portrait dimensions or omit AVIF to improve timings.

This record is Proposed pending PR review and acceptance. The prepared implementation
is a deliberate CPU-effort policy change from the original implicit default. It
does not replace ADR 0002 or the accepted signature mechanism in ADR 0005.

## Consequences

Lower effort can change AVIF bitstreams, compression efficiency and reconstructed
pixels even at the same quality value. Decode and color-detail tests, encoded
watermark/signature recovery tests, and visual inspection remain required. The
measured synthetic outputs were slightly smaller; no universal size saving is
promised. Existing ready images are not automatically regenerated.

The full implementation must pass mandatory checks and existing media pipeline
tests before landing. After worker deployment, repeat owned new-upload canaries,
capture actual Ready timings, check portrait/landscape rendered quality, and
identify the token from actual WebP and AVIF bytes. Retain the observed 95/150-second
baseline separately from local encoder timings. A staging latency reduction is
unverified until that rollout. Further sizing changes, resource changes or partial
Ready semantics require their own assessment and decision.
