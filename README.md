# Vendor Portal

A full-stack Vendor Management System built for **Ideasion** to streamline vendor onboarding, activation, document verification, annual renewal, and service-category management.

---

## Features

### Vendor-Facing
| Feature | Description |
|---|---|
| **Self-Service Onboarding** | 5-step wizard: company info → tax/banking → service categories → document upload → review |
| **Document Upload** | Drag-and-drop PDF/image upload with type tagging (T&C, COI, bank letter, etc.) |
| **Dashboard** | Real-time status, renewal alerts, document verification progress, category chips |
| **Profile Management** | Edit company details and tax/banking info at any time |
| **Services Listing** | Add/remove the specific services your company offers |
| **Annual Renewal** | Guided renewal flow to upload a new COI and re-sign T&C before the anniversary date |

### Admin-Facing
| Feature | Description |
|---|---|
| **Vendor Queue** | Paginated, filterable table with search, status filter, and category filter |
| **One-Click Actions** | Approve / Request Info / Suspend / Reject with admin notes and confirmation dialog |
| **Document Review** | Per-document verify checkbox; open originals via signed URL |
| **Vendor Rating** | 1–5 star ratings per admin with comments and visual rating breakdown |
| **Category Assignment** | Add/remove service categories per vendor |
| **Service Categories CRUD** | Manage the full list of procurement categories |
| **Reports** | Live status bar chart + renewal calendar (60-day lookahead) |
| **Activity Timeline** | Full audit log of every status change per vendor |

### Automated
| Feature | Description |
|---|---|
| **Welcome Email** | Sent automatically when vendor is approved (includes Vendor ID) |
| **Submission Notification** | Emails vendor (confirmation) + admin (new application) on signup |
| **30-Day Renewal Nudge** | Daily cron checks contracts within 30 days; sends reminder email |
| **Auto Action-Required** | Vendors past anniversary without renewal are automatically flagged |
| **Status Emails** | Emails sent on suspend, reject, and action-required transitions |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · Vite 7 · TypeScript |
| UI | Shadcn/UI · Tailwind CSS v4 · Radix UI |
| State / Fetching | TanStack Query v5 |
| Forms | React Hook Form · Zod |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| Email | Resend |
| Deployment | Vercel |

---

## Project Structure

```
src/
├── App.tsx                       # Router with all routes + ErrorBoundary
├── main.tsx                      # Entry point with ThemeProvider
├── contexts/AuthContext.tsx      # Session, profile, role
├── hooks/
│   ├── useVendor.ts              # Current vendor (vendor role)
│   ├── useVendors.ts             # All vendors with filters (admin)
│   ├── useDocuments.ts           # Upload, list, verify docs
│   ├── useCategories.ts          # CRUD for service categories
│   ├── useRatings.ts             # Vendor ratings
│   └── useAuditLog.ts            # Status change history
├── components/
│   ├── layout/                   # AdminLayout, VendorLayout, AuthLayout
│   ├── shared/                   # StatusBadge, DocumentUploader, RatingStars,
│   │                             #   ThemeToggle, ErrorBoundary, ConfirmDialog, …
│   ├── auth/                     # LoginForm, SignupForm, AuthGuard
│   ├── onboarding/               # OnboardingWizard + Step1–5
│   └── ui/                       # Shadcn generated components
├── pages/
│   ├── Login.tsx / Signup.tsx / NotFound.tsx
│   ├── onboarding/OnboardingPage.tsx
│   ├── vendor/                   # Dashboard, Profile, Documents, Services,
│   │                             #   Categories, Renewal
│   └── admin/                    # Dashboard, VendorList, VendorDetail,
│                                 #   CategoryManagement, Reports
└── lib/
    ├── supabase.ts               # Singleton browser client (@supabase/ssr)
    ├── types.ts                  # All TypeScript interfaces
    └── constants.ts              # Status labels, colours, document types

supabase/
├── migrations/
│   ├── 001_initial_schema.sql    # Tables, sequences, indexes
│   ├── 002_rls_policies.sql      # Row-level security + is_admin() helper
│   ├── 003_triggers.sql          # Profile creation, vendor ID, audit log
│   └── 004_pg_cron.sql           # Daily renewal cron registration
├── storage-setup.sql             # Storage bucket + policies
├── seed.sql                      # 10 default service categories
└── functions/
    ├── send-email/               # Shared Resend helper (not a public endpoint)
    ├── on-vendor-submitted/      # DB webhook → submission emails
    ├── on-vendor-approved/       # DB webhook → welcome email
    ├── on-vendor-status-changed/ # DB webhook → status notification emails
    └── renewal-cron/             # Daily: nudge emails + auto action-required
```

---

## Database Schema

```
profiles           — extends auth.users; role: 'admin' | 'vendor'
service_categories — admin-managed procurement categories
vendors            — core vendor record (status, banking, tax, contract dates)
vendor_categories  — many-to-many: vendors ↔ categories
vendor_services    — free-form services list per vendor
vendor_documents   — uploaded files with type, expiry, verification status
vendor_ratings     — 1–5 star admin ratings; one per admin per vendor
audit_log          — immutable status change history
```

**Vendor status lifecycle:**
```
pending_review ──► active ──► action_required ──► pending_review (after renewal)
                        └──► suspended
                        └──► rejected
```

---

## Setup & Installation

### 1. Clone and install

```bash
git clone https://github.com/haashirideassion/vendor-management.git
cd vendor-management
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:
```env
VITE_SUPABASE_URL=https://qxvudwuspapheknxpziy.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
```

### 3. Run database migrations

In the [Supabase SQL Editor](https://supabase.com/dashboard/project/qxvudwuspapheknxpziy/editor), run these files **in order**:

```
1. supabase/migrations/001_initial_schema.sql
2. supabase/migrations/002_rls_policies.sql
3. supabase/migrations/003_triggers.sql
4. supabase/storage-setup.sql
5. supabase/seed.sql
```

### 4. Promote your admin user

Sign up through the app at `/signup`, then in the SQL Editor:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

### 5. Configure email (Resend)

Get a free API key at [resend.com](https://resend.com), then in **Supabase → Edge Functions → Secrets**:
```
RESEND_API_KEY   = re_xxxxxxxxxxxxxxxxxxxx
APP_URL          = https://your-deployed-domain.com
ADMIN_EMAIL      = admin@yourdomain.com
```

### 6. Deploy edge functions

```bash
# Link to your Supabase project first
supabase link --project-ref qxvudwuspapheknxpziy

# Deploy all functions
supabase functions deploy
```

### 7. Register database webhooks

In **Supabase → Database → Webhooks**, add:

| Webhook name | Table | Event | Function URL |
|---|---|---|---|
| `on-vendor-submitted` | `vendors` | `INSERT` | `.../functions/v1/on-vendor-submitted` |
| `on-vendor-approved` | `vendors` | `UPDATE` | `.../functions/v1/on-vendor-approved` |
| `on-vendor-status-changed` | `vendors` | `UPDATE` | `.../functions/v1/on-vendor-status-changed` |

### 8. Enable pg_cron (renewal automation)

In **Supabase → Database → Extensions**, enable `pg_cron`.  
Then run `supabase/migrations/004_pg_cron.sql` in the SQL Editor.  
This schedules the renewal check at 08:00 UTC daily.

### 9. Start the dev server

```bash
npm run dev
```

---

## Deployment to Vercel

1. Push this repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Deploy — `vercel.json` handles SPA client-side routing automatically

Build command: `npm run build` · Output: `dist/`

---

## User Roles

| Role | Access |
|---|---|
| **vendor** | Onboarding, own dashboard, own documents/services/profile, renewal |
| **admin** | All vendors, approve/reject/suspend, document review, ratings, categories, reports |

New signups are always `vendor`. Admins are promoted manually via SQL.

---

## Theme & Accessibility

- Full **Light / Dark / System** theme support
- Toggle via the ☀️/🌙 icon in every layout's top-right corner
- Keyboard shortcut: press **`D`** anywhere (outside inputs) to cycle themes
- Flash-of-wrong-theme prevention via inline `<script>` in `index.html`

---

## Security Notes

- **Row-Level Security** on every table — vendors only see their own data
- **Vendor IDs** (`IDN-XXXX`) are assigned by a PostgreSQL trigger on activation, never from the client
- **Documents** are stored in a private Supabase Storage bucket; access is via time-limited signed URLs (5 min)
- **Admin notes** on reject/suspend are required before submitting the action
- Security headers (X-Frame-Options, X-Content-Type-Options, etc.) set via `vercel.json`

---

## License

MIT © Ideasion
