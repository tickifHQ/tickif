# Demo seed fixture images

Real interior-design photos used by `pnpm db:seed:demo` (see `apps/api/src/scripts/seed-demo/`).
The JPEGs are **not committed** — the seed script downloads any missing file from
`https://images.unsplash.com/photo-<id>?w=1600&q=78&fm=jpg&fit=max` on first run and caches
it in this directory (gitignored). The photo id for each file lives in
`apps/api/src/scripts/seed-demo/data.ts` (`unsplashId`).

All photos are from [Unsplash](https://unsplash.com) and are used under the
[Unsplash License](https://unsplash.com/license) (free to use, no attribution required).

| File | Room | Source |
| --- | --- | --- |
| d1-p1-01-living-room.jpg | Living Room | https://unsplash.com/photos/1586023492125-27b2c045efd7 |
| d1-p1-02-modular-kitchen.jpg | Modular Kitchen | https://unsplash.com/photos/1556911220-bff31c812dba |
| d1-p1-03-master-bedroom.jpg | Master Bedroom | https://unsplash.com/photos/1616594039964-ae9021a400a0 |
| d1-p1-04-dining.jpg | Dining | https://unsplash.com/photos/1617806118233-18e1de247200 |
| d1-p2-01-living-room.jpg | Living Room | https://unsplash.com/photos/1583847268964-b28dc8f51f92 |
| d1-p2-02-bedroom.jpg | Bedroom | https://unsplash.com/photos/1595526114035-0d45ed16cfbf |
| d1-p2-03-kitchen.jpg | Kitchen | https://unsplash.com/photos/1600489000022-c2086d79f9d4 |
| d1-p2-04-study.jpg | Study | https://unsplash.com/photos/1486946255434-2466348c2166 |
| d2-p3-01-living-and-dining.jpg | Living & Dining | https://unsplash.com/photos/1600607687939-ce8a6c25118c |
| d2-p3-02-master-bedroom.jpg | Master Bedroom | https://unsplash.com/photos/1505693416388-ac5ce068fe85 |
| d2-p3-03-guest-bedroom.jpg | Guest Bedroom | https://unsplash.com/photos/1522771739844-6a9f6d5f14af |
| d2-p3-04-garden-landscape.jpg | Garden / Landscape | https://unsplash.com/photos/1600585154340-be6161a56a0c |
| d2-p4-01-dining-area.jpg | Dining Area | https://unsplash.com/photos/1554118811-1e0d58224f24 |
| d2-p4-02-bar-counter.jpg | Bar Counter | https://unsplash.com/photos/1521017432531-fbd92d768814 |
| d2-p4-03-outdoor-seating.jpg | Outdoor Seating | https://unsplash.com/photos/1445116572660-236099ec97a0 |
| d2-p4-04-billing-counter.jpg | Billing / Takeaway Counter | https://unsplash.com/photos/1453614512568-c4024d13c247 |
