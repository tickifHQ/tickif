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

The implementation uses the `sig-v1` derivative key suffix to bypass immutable
caches. Existing images need the [documented reprocessing operation](../runbooks/media-pipeline.md)
before they contain the token; deploying the code alone does not finish the
rollout. This record accepts the mechanism, not a claim that backfill is complete.

## Amendments

None.
