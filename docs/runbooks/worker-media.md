# Worker media runtime

The watermark uses the supplied Tickif SVG assets, including their paths,
translucency and shadows. No text or system font is used. The worker build copies
`src/media/assets` to `dist/assets`, beside the bundled code. The Docker image
copies that directory with the worker build.

Build and check the production image from the repository root:

```bash
docker build -f apps/worker/Dockerfile -t tickif-worker:media-check .
bash infra/staging/scripts/test-worker-media.sh tickif-worker:media-check
```

The probe runs as UID 1001 with networking disabled and a read-only root filesystem.
It loads every packaged SVG and checks that Sharp renders visible pixels into
WebP and AVIF. The unit tests cover placement and bounds using the production
watermark renderer. The browser check exercises upload, worker processing and
public image delivery. None of these checks deploys staging.

For new logo assets or placement changes, bump `WATERMARK_REVISION` and follow the
[reprocessing runbook](./media-pipeline.md). Existing ready images retain their old
derivatives until reprocessed. `WATERMARK_TEXT` is no longer used and can be removed
from deployment configuration.
