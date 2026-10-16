# Admin lead visibility and reporting

The admin shell links to **Leads and pipeline** (`/admin/leads`) and **Company
analytics** (`/admin/analytics`), with entry points on `/dashboard`. Existing
moderation and enquiry directories remain available.

The `admin-visibility` API module exposes private, uncached platform-admin reads:

| Endpoint under `/api/admin/insights` | Purpose                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `GET /companies`                     | Search company names with bounded pagination or resolve a selected ID                  |
| `GET /leads`                         | Date/company/designer/search/stage filtered leads with scoped pipeline counts          |
| `GET /leads/{id}`                    | Full lead and linked enquiry details, notes, assignment, and paginated studio messages |
| `GET /entities`                      | Company or designer performance comparison, including inactive/frozen branches         |
| `GET /report`                        | Summary measures and zero-filled daily enquiry submission cohorts                      |

Contracts live in `packages/contracts/src/admin-visibility.ts`. Routes require
fresh authenticated admin/superadmin roles, independently of organization
membership. These reads never mark enquiries viewed or contacted or acknowledge
requester activity. Frontend requests use the typed API client and no-store reads.

Filters default to the last 30 India calendar days. Explicit dates are paired,
inclusive, and bounded to 366 days; users can select older historical windows.
Invalid company/designer combinations return 404. Company selection is searched
and paginated, rather than truncating the directory. Lead stage counts preserve
the date/company/designer/text scope while ignoring only the active stage filter.
Pagination and company → designer → lead links retain the reporting scope.

Response reporting uses the actual studio-message milestone (`contactedAt`)
among enquiries submitted within the period. Current pipeline conversion counts
those enquiries with a linked lead currently contacted or closed. Both divide
by enquiries submitted, including zero for empty cohorts. Later studio responses
count toward the original submission cohort. Legacy status-only responses are
excluded from actual recorded responses. No sale or revenue is inferred.

Lead counts use received dates. Project/profile views use retained interaction
events within the window, and projects created use creation dates. Each fact is
aggregated independently to avoid multiplying counts when joined. These are
current cohort outcomes, not a historical lead-stage ledger. See
[ADR 0016](../adr/0016-admin-lead-visibility-and-cohort-reporting.md).

Consultation scheduling remains disabled/deferred per [ADR 0003](../adr/0003-consultation-enquiries.md).
