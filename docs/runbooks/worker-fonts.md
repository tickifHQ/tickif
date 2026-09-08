# Worker font configuration

The media worker rasterizes SVG text when it builds watermarked public images.
The pinned Debian slim runtime did not contain `/etc/fonts/fonts.conf` or a
system font package. Rendering text in the previous image reproduced
`Fontconfig error: Cannot load default config file: File not found`, even though
Sharp returned a PNG buffer. A successful image job alone does not verify that
the intended text appeared.

The runtime image now installs Fontconfig and DejaVu core fonts, then builds the
font cache as part of the image build. The application still runs as UID 1001
with the read-only filesystem configured by the staging stack. Sharp's bundled
Fontconfig can require a different cache from the system utility, so
`XDG_CACHE_HOME=/tmp/tickif-cache` puts its disposable cache on the existing
writable `/tmp` mount. No root runtime, provider credential or writable font
directory is required.

## Validation

Build the worker from the repository root, then run the image-level regression:

```bash
docker build -f apps/worker/Dockerfile -t tickif-worker:font-check .
bash infra/staging/scripts/test-worker-fonts.sh tickif-worker:font-check
```

The probe disables networking, keeps the root filesystem read-only, verifies the
application UID and installed font resolution, and renders visible text into
WebP and AVIF images. It checks decoded dimensions and pixel variation, and fails
on a Fontconfig warning. Images stay in memory. The disposable Swarm image suite
runs this probe too.

The existing watermark tests cover the actual production SVG pattern and
derivative pipeline. This image check covers their runtime font dependency.
Neither check deploys staging. After the reviewed image is deployed, inspect the
worker logs and verify a newly generated watermarked preview there. The original
staging evidence showed successful jobs, not a demonstrated image-generation
failure.
