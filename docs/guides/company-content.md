# Company documents

Company footer and login agreement pages render local Markdown:

| URL                         | File in `apps/web/content/company/` | Status |
| --------------------------- | ----------------------------------- | ------ |
| `/company/about`            | `about.md`                          | Sample |
| `/company/report-a-problem` | `report-a-problem.md`               | Draft  |
| `/company/takedown-policy`  | `takedown-policy.md`                | Draft  |
| `/company/terms`            | `terms.md`                          | Draft  |
| `/company/privacy`          | `privacy.md`                        | Draft  |

The four report/policy drafts were prepared on **10 October 2026** at the product owner's request. They have no effective date and are not assertions of deployed legal compliance. About remains the previous sample. All retain `noindex, nofollow` until publication readiness is assessed.

## Rendering and editing

Titles, descriptions and status live in `apps/web/src/lib/company-pages.ts`. The server-only loader reads only registered files and calculates reading estimates and a section index. Next standalone tracing includes the content files. The route uses shared Tickif text roles, semantic tokens, document spacing and responsive navigation. Use **plain-text ATX `##` headings** for indexed sections; fenced code is excluded. Section IDs use source line numbers to keep duplicate titles unique.

BlogBody supplies IDs only with `sectionIds` enabled. Raw HTML, images and unsafe protocols remain excluded. The blog and documents share typography. Keep each Markdown notice, the route date and registry status consistent. A preparation date is not an effective date. Helvetica Neue retains the existing system fallback because no licensed webfont was supplied.

## Primary research sources

Consulted on 10 October 2026; recheck amendments, corrigenda, commencement and applicability before adoption:

- [MeitY Intermediary Rules, updated 10 February 2026](https://www.meity.gov.in/static/uploads/2026/02/550681ab908f8afb135b0ad42816a1c9.pdf): category-specific duties and appeals. Older summaries contain superseded deadlines.
- [Copyright Rules, 2013, Rule 75](https://www.copyright.gov.in/Copyright_Rules_2013/chapter_xiv.html): conditional transient/incidental storage procedure, distinguished from ordinary portfolio complaints.
- [E-Commerce Rules, 2020](https://consumeraffairs.gov.in/public/upload/files/E%20commerce%20rules_1732703966.pdf), [2021 amendment](<https://consumeraffairs.gov.in/public/upload/files/Consumer%20Protection%20(E-Commerce)%20(Amendment)%20Rules,%202021_1732704241.pdf>) and [September 2026 government announcement](https://www.pib.gov.in/newsite/erelcontent.aspx?lang=2&reg=48&relid=294532): consumer disclosures and the announced January 2027 changes. Review the complete 2026 amending Gazette before launch; the announcement alone is insufficient for an operational compliance audit.
- [CCPA final dark-pattern guidance announcement](https://www.pib.gov.in/PressReleasePage.aspx?PRID=1983994): clear choice, pricing and subscription consent. The CCPA PDF returned a gateway error; the official announcement was readable.
- [Government SPDI Rules clarification](https://www.pib.gov.in/newsite/erelcontent.aspx?lang=2&reg=48&relid=74990): existing sensitive-information framework. The old MeitY PDF returned 404; the [original Gazette text hosted by WIPO Lex](https://www.wipo.int/wipolex/en/text/494931) was read instead, including the existing rule 5(9) grievance period.
- [DPDP commencement, G.S.R. 843(E)](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf), [DPDP Rules, G.S.R. 846(E)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf), and [corrigendum, G.S.R. 892(E)](https://www.meity.gov.in/static/uploads/2025/12/3c7ebbae0e5456f493f486e6845df86b.pdf): phased commencement. The corrigendum does not change the 18-month period; most processing duties and rights are not yet operative on the preparation date.
- [GAC](https://gac.gov.in/), [National Consumer Helpline](https://consumerhelpline.gov.in/), [112](https://112.gov.in/), [cybercrime portal](https://cybercrime.gov.in/), [official 1930 helpline page](https://cybercrime.gov.in/Hindi/Helplinehn.aspx) and [Consumer Affairs confirmation of 1915](https://consumeraffairs.gov.in/pages/public-grivance): independent escalation and safety resources.

Market references: [Houzz Terms](https://www.houzz.com/termsOfUse), [Houzz Privacy](https://www.houzz.com/privacyPolicy) and [Pinterest Copyright](https://policy.pinterest.com/en/copyright). Compared independent-professional responsibilities, ownership, disclosure structure and review routes. Tickif's text is original and does not copy Houzz's perpetual licence/moral-rights waiver, import the US DMCA timetable, or claim these products' advertising/AI practices apply to Tickif.

## Product evidence and publication prerequisites

The drafts follow [ADR 0003](../adr/0003-consultation-enquiries.md) for enquiries and [ADR 0004](../adr/0004-early-bird-trials.md) for no-card trials without automatic conversion. Billing cancellation, refund assessment and deletion remain separate; this work adds no refund engine.

Privacy descriptions were checked against auth and account settings, enquiry/team permissions, [media](../architecture/media-pipeline.md), search cleanup, billing, browser storage and [observability](../architecture/observability.md). Search cleanup uses 180 days; organisation lifecycle periods are configurable. Neither is a universal production retention guarantee.

Before adoption:

1. Confirm operator identity, registered/principal addresses, support email and grievance officer details. The existing canonical WhatsApp support link is retained in the footer and Report a problem guide; it does not establish a formal grievance officer. Add and test monitored notice/privacy channels, including urgent intake; the pages are not submission backends.
2. Obtain legal review of actual intermediary/e-commerce roles, consent/lawful basis, retention, remedies, current amending Gazettes and DPDP corrigendum/commencement.
3. Verify production processors, regions, contracts, cookies/storage, consent controls, incident response and category-specific retention including backups and legal holds. Establish identity verification and rights/deletion handling.
4. Staff and test receipt/reference/review procedures against applicable deadlines. Confirm the age policy and children's-data safeguards; the adult-only draft rule is not an implemented age gate.
5. Confirm purchase disclosures, provider cancellation confirmations and refund processes. Set effective dates and appropriate notice/acceptance, then revise draft status and indexing deliberately.

Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and Company browser tests. Verify footer routes, mobile wrapping, section anchors and login policy links. Login distinguishes agreement to Terms from acknowledgement of the Privacy notice; both links open in separate tabs to preserve login data. Company pages remain accessible without the scroll sign-up gate.
