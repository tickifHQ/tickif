> Draft for review. Prepared on 10 October 2026 from Tickif’s current implementation. Operator, production providers, retention periods and a working privacy contact must be confirmed before adoption.

## Who handles your information

This notice covers Tickif’s discovery, portfolio, account, enquiry and workspace features. **Legal operator name, business address and privacy/grievance contact: pending confirmation.** That operator will be responsible for Tickif’s processing. No effective date has been set for this draft.

A professional receiving your enquiry also handles it for their own client communications. Their service and practices are separate from Tickif’s. Our [Terms](/company/terms) explain that relationship.

## Information you provide

- **Account:** name, email, phone number, sign-in method, profile image, role and verification state. Google sign-in provides the basic account information used for that sign-in.
- **Personal settings:** address, WhatsApp number and other details you choose to add. Avoid adding unnecessary sensitive information.
- **Feed preferences:** home type and city/locality choices you save during visitor onboarding or later edits. These choices filter your personalised feed; you can skip the optional preferences or change them later.
- **Business and team:** biography, professional contact details, city or service area, branches, memberships, invitations, permissions and verification evidence you submit.
- **Projects and media:** descriptions, room and design information, photographs, captions, credits, uploads and moderation history. Obtain permission for homes and people shown in uploads.
- **Enquiries and reviews:** contact information, requirements and messages submitted with an enquiry, and reviews you choose to publish.
- **Billing:** plans, trial eligibility, subscription references, payment status and invoice-related information. Payment credentials are entered with the payment provider; never send a CVV, banking password or UPI PIN in a report.
- **Support:** contact details, URLs, explanations and evidence supplied when seeking help or challenging content.

## Information from using Tickif

Session and request records can include IP address, browser or device information and timestamps. Tickif records interactions such as project or image views, enquiry activity and searches to operate discovery and produce workspace metrics. A browser identifier can distinguish repeat image and project views; it is pseudonymous, not guaranteed anonymous.

Technical logs and error reports help diagnose failures and abuse. The implementation sanitises logs and excludes sensitive authentication and request data from ordinary telemetry. Actual deployment settings and external telemetry destinations still require verification.

When a professional connects a Google business listing, selected business and rating information may be obtained for display. Basic Google sign-in does not need access to your contacts, inbox or unrelated Google files.

## Why we use information

Relevant information supports accounts and authentication, permissions, authorised portfolio publishing, enquiries, saved projects, billing and entitlements, service messages, moderation, fraud prevention and diagnosis of technical problems. Public project and profile information supports discovery; interaction records support aggregated or workspace-scoped reporting. Complaint and payment records support reconciliation, disputes and legal duties.

A new purpose should be explained before use and consent obtained where required. Accepting the Terms does not authorise unrelated marketing. This draft does not assert that Tickif sells personal information, uses advertising trackers or trains general-purpose AI models on private enquiries. Introducing such practices would require fresh disclosure and appropriate permission or lawful basis.

## Visibility and sharing

Published designer profiles, images, descriptions, selected professional contact details and public reviews may be visible to anyone, including search engines. Do not publish exact private home addresses, children’s details or identity documents in a portfolio.

Enquiries are shared with the selected professional’s authorised workspace users. Billing and team records follow workspace permissions. Tickif staff and providers may access records needed for support, moderation, safety and operations. An enquiry is not necessarily visible only to the first individual who receives it.

Original image files are stored privately with restricted authorised access. The media pipeline creates public derivatives for published projects, removes EXIF metadata from those derivatives and may add watermarks or embedded identifiers. Removing metadata does not remove private information visible inside a photograph.

## Providers and transfers

The code supports Cloudflare R2 for media, Razorpay for subscription payments, Resend for email, Novu-backed messaging where configured, Google sign-in and business listings, and Typesense-powered search. Providers receive information needed for their functions. Activation depends on deployment; this is an implementation inventory, not a verified list of every production processor.

Hosting, database, network and observability providers may also process information. **Production provider names, regions and transfer safeguards: pending confirmation.** We do not claim all information stays in India. Transfers must meet the restrictions and protections applicable at the time, including applicable sensitive-information requirements.

Relevant records may be disclosed for a valid legal obligation, protection of people or the service, or fraud investigation. Disclosure should be necessary and proportionate. A change of business ownership should preserve applicable protections and involve notice where required.

## Cookies and browser storage

Authentication cookies maintain and validate sessions. Browser storage also supports recent searches, dismissal of the sign-up prompt, a pseudonymous image-view identifier, temporary dashboard state and plan selection. Storage can persist beyond a visit depending on the feature.

Clearing cookies and local storage can sign you out, reset preferences and remove device-stored searches. Signing out does not necessarily clear all storage. Authentication and engagement measurement have different purposes. Production cookie names, durations, analytics configuration and appropriate consent controls need review before adoption.

## Retention and deletion

Keep records only as long as needed for their purpose, a legal duty, security, accounting or a genuine dispute, then delete or de-identify them appropriately. Backups, cached derivatives and external copies may disappear later than live public content.

Search-activity cleanup currently uses a 180-day configuration. Organisation closure has configurable delisting, archive and purge stages; it is not immediate deletion of all information. These are specific code behaviours, not a universal retention period. **Production periods for accounts, enquiries, verification evidence, interaction events, payments, logs and backups still require approval and documentation.** Legal holds may delay deletion.

Where applicable, the [Intermediary Rules](https://www.meity.gov.in/static/uploads/2026/02/550681ab908f8afb135b0ad42816a1c9.pdf) require 180-day retention of registration information after cancellation and of removed content with associated evidence, or longer when lawfully required. This does not authorise indefinite retention of every category.

## Choices and requests

Use settings to correct editable information and content controls to manage submissions. Organisation owners have closure controls, which are separate from personal account deletion. A general self-service personal-account deletion flow has not been confirmed for this notice.

The intended route for access, correction, consent withdrawal, deletion or privacy complaints is the privacy/grievance contact once published. Provide your account identifier, the request and a safe reply address. Identity verification should be proportionate and never require sharing a password or OTP. Withdrawal may stop a feature working, but does not undo earlier lawful processing or required retention. A refusal or partial response should explain why and how to escalate.

Where the [SPDI Rules, 2011, rule 5(9)](https://www.wipo.int/wipolex/en/text/494931) apply, the grievance officer must address information-processing grievances expeditiously and within one month of receipt. This existing duty is separate from future DPDP procedures; it is not a claim that Tickif already has a working intake channel.

**Privacy contact and secure request channel: pending confirmation.** This page does not submit a request or establish an operational rights-request process. [Report a problem](/company/report-a-problem) explains what to prepare and independent escalation options.

## Children and security

Accounts are intended for adults aged 18 or older. Do not create a child’s account or upload children’s personal information without appropriate permissions and a lawful basis. Concerns should reach the privacy or content channel once available. This proposed age rule does not mean age verification or parental consent has been implemented.

Tickif’s code includes access controls, private originals, authenticated permissions, rate limits and log sanitisation. Security also depends on deployment and operations; absolute security cannot be guaranteed. Suspected breaches should be assessed, contained and notified to people and authorities when legally required. A tested incident-response process is a publication prerequisite.

## Indian privacy framework and updates

The [government’s SPDI Rules clarification](https://www.pib.gov.in/newsite/erelcontent.aspx?lang=2&reg=48&relid=74990) explains the existing sensitive-information framework. The [DPDP commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf) phases the 2023 Act: most processing duties and individual rights commence 18 months after Gazette publication on 13 November 2025, rather than all being operative on this draft’s date. The [DPDP Rules, 2025](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf), read with the [December 2025 corrigendum](https://www.meity.gov.in/static/uploads/2025/12/3c7ebbae0e5456f493f486e6845df86b.pdf), also have phased commencement.

Review the notice and controls before relevant provisions commence, including consent, children’s data, rights, safeguards and breach procedures. This draft does not claim every DPDP control or Board complaint process is already available. Reflect processing changes here with a revised date and appropriate notice. Statutory rights remain available regardless of this wording.
