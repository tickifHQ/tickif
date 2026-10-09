# ADR 0005 — Tickif image signatures instead of SynthID

Status: Accepted
Date: Original decision date not recorded; confirmed by the product owner on 2026-10-09.
Supersedes: The SynthID request in the Tickif feedback tracker (not ADR 0002).
Superseded by: None

## Context

The [feedback tracker](https://app.notion.com/p/Tickif-feedback-tracker-fixes-PRs-and-proof-3f420b23ef8780e5b2fee8294b25be42)
requested SynthID for designer-uploaded images. Tickif accepts existing photographs;
the media pipeline does not generate them through a Google generation model.
SynthID was omitted in favour of the implemented Tickif image signature. The
product owner explicitly confirmed that deviation on 9 October 2026.

## Decision

Use the Tickif embedded image token for public WebP and AVIF derivatives instead
of SynthID. Derive it from the stored image ID and identify it with the existing
`media:identify` command. Keep the visible Tickif watermark as a separate branding
layer and preserve private originals unchanged.

This supplements [ADR 0002](./0002-media-pipeline.md); it does not replace the
upload, authorization, processing or storage architecture. Do not describe the
token as SynthID, a cryptographic ownership proof, or guaranteed protection from
editing. A future change to the identifier or its guarantees requires a new ADR.

## Consequences

The identifier works without sending designer uploads to an external generation
service. Cropping, resizing, screenshots, very small images and flat areas can
destroy or obscure it. Pixel changes may introduce low-level texture. These
limitations are documented in the [media architecture](../architecture/media-pipeline.md).

The implementation uses revisioned derivative key suffixes to bypass immutable
caches. Existing images need the [documented reprocessing operation](../runbooks/media-pipeline.md)
before they contain the token; deploying the code alone does not finish the
rollout. This record accepts the mechanism, not a claim that backfill is complete.

## Amendments

### Implementation update — 2026-10-10

A staging photographic canary recovered its token from WebP but failed AVIF
identification on the deployed Linux codec. The `sig-v2` implementation doubles
the maximum repetitions per bit from six to twelve while retaining the same
coefficient strength and token/checksum format. The reader retains the v1 layout
for previously downloaded images. More blocks receive small changes, so this
improves codec recovery without claiming invisible or guaranteed identification.
Deployment requires another derivative backfill; `sig-v1` keys alone never proved
that every encoded token was recoverable. The accepted mechanism and private
original boundary remain the same.
