-- Phase 3 (RBAC bundle model), step 2 of 5: seed the permission catalog and
-- the 6 system roles (org: Admin/Manager/Associate; vendor: Admin/Manager/
-- Associate) with their bundles.
--
-- Org-side bundles are CUMULATIVE by design (each tier's role_permissions
-- row set includes everything the tier below it has, plus its own
-- additions) -- Manager can do everything Associate can, Admin everything
-- Manager can. Threshold-sensitive actions get two keys each (e.g.
-- purchase_orders.approve / purchase_orders.approve_unlimited) so Manager
-- and Admin read the same organizations.approval_threshold (added in 019).
--
-- Vendor-side bundles are seeded literally as specified (company profile/
-- bank/docs/user-mgmt for Admin; quotations/negotiation/PO fulfillment/
-- invoice submission for Manager; delivery confirmation/quotation-line-item
-- drafting for Associate) -- NOT cumulative, since the spec describes these
-- as three distinct functional areas rather than a threshold hierarchy. If
-- Manager should also be able to do everything Associate does day-to-day,
-- add vendor Associate's two keys to vendor Manager's bundle below.

INSERT INTO permissions (key, module, action, description) VALUES
  ('engagements.draft',            'engagements',     'draft',            'Draft a new engagement'),
  ('engagements.finalize',         'engagements',     'finalize',         'Finalize/approve an engagement'),
  ('grns.record',                  'grns',            'record',           'Record a goods receipt note'),
  ('invoices.data_entry',          'invoices',        'data_entry',       'Data-entry on invoices (submit for review)'),
  ('invoices.approve',             'invoices',        'approve',          'Approve an invoice up to the org approval threshold'),
  ('invoices.approve_unlimited',   'invoices',        'approve_unlimited','Approve an invoice above the org approval threshold'),
  ('quotations.compare_select',    'quotations',      'compare_select',   'Compare and select quotations'),
  ('purchase_orders.create',       'purchase_orders', 'create',           'Create a purchase order'),
  ('purchase_orders.approve',      'purchase_orders', 'approve',          'Approve a PO up to the org approval threshold'),
  ('purchase_orders.approve_unlimited', 'purchase_orders', 'approve_unlimited', 'Approve a PO above the org approval threshold'),
  ('contracts.draft',              'contracts',       'draft',            'Draft a contract'),
  ('contracts.execute',            'contracts',       'execute',          'Execute/sign a contract'),
  ('reports.view',                 'reports',         'view',             'View organization reports'),
  ('vendors.select',               'vendors',         'select',           'Select a vendor up to the org approval threshold'),
  ('vendors.select_unlimited',     'vendors',         'select_unlimited', 'Final vendor selection above the org approval threshold'),
  ('vendors.manage_status',        'vendors',         'manage_status',    'Manage a vendor''s org-side relationship status'),
  ('documents.verify',             'documents',       'verify',           'Verify vendor compliance documents'),
  ('categories.manage',            'categories',      'manage',           'Manage vendor categories'),
  ('vendors.rate',                 'vendors',         'rate',             'Rate a vendor'),
  ('users.manage',                 'users',           'manage',           'Manage users and roles within the org'),
  ('vendor_profile.manage',        'vendor_profile',  'manage',           'Manage vendor company profile'),
  ('vendor_bank.manage',           'vendor_bank',     'manage',           'Manage vendor bank details'),
  ('vendor_docs.manage',           'vendor_docs',     'manage',           'Manage vendor compliance documents'),
  ('vendor_users.manage',          'vendor_users',    'manage',           'Manage vendor staff users'),
  ('quotations.submit',            'quotations',      'submit',           'Submit a quotation'),
  ('quotations.negotiate',         'quotations',      'negotiate',        'Negotiate a quotation'),
  ('purchase_orders.fulfill',      'purchase_orders', 'fulfill',          'Fulfill a purchase order'),
  ('invoices.submit',              'invoices',        'submit',           'Submit an invoice'),
  ('deliveries.confirm',           'deliveries',      'confirm',          'Confirm a delivery'),
  ('quotations.draft_line_items',  'quotations',      'draft_line_items', 'Draft quotation line items')
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (name, scope, description) VALUES
  ('Admin',     'org',    'Approvals above threshold, final vendor selection above threshold, contract execution/signing, user and role management'),
  ('Manager',   'org',    'Finalize engagements, compare/select quotations, create and approve POs up to threshold, first-level invoice approval, draft contracts'),
  ('Associate', 'org',    'Draft engagements, record GRNs, data-entry on invoices'),
  ('Admin',     'vendor', 'Company profile, bank details, compliance docs, vendor user management'),
  ('Manager',   'vendor', 'Quotations, negotiation, PO fulfillment, invoice submission -- the senior day-to-day role'),
  ('Associate', 'vendor', 'Delivery confirmations, drafting quotation line items, limited to assigned engagements')
ON CONFLICT (scope, name) DO NOTHING;

-- ─── org Associate ──────────────────────────────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'org' AND r.name = 'Associate'
  AND p.key IN ('engagements.draft', 'grns.record', 'invoices.data_entry')
ON CONFLICT DO NOTHING;

-- ─── org Manager (cumulative: Associate's 3 + its own 7) ───────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'org' AND r.name = 'Manager'
  AND p.key IN (
    'engagements.draft', 'grns.record', 'invoices.data_entry',
    'engagements.finalize', 'quotations.compare_select', 'purchase_orders.create',
    'purchase_orders.approve', 'invoices.approve', 'contracts.draft', 'reports.view'
  )
ON CONFLICT DO NOTHING;

-- ─── org Admin (cumulative: Manager's 10 + its own 10) ─────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'org' AND r.name = 'Admin'
  AND p.key IN (
    'engagements.draft', 'grns.record', 'invoices.data_entry',
    'engagements.finalize', 'quotations.compare_select', 'purchase_orders.create',
    'purchase_orders.approve', 'invoices.approve', 'contracts.draft', 'reports.view',
    'purchase_orders.approve_unlimited', 'vendors.select', 'vendors.select_unlimited',
    'contracts.execute', 'invoices.approve_unlimited', 'vendors.manage_status',
    'documents.verify', 'categories.manage', 'vendors.rate', 'users.manage'
  )
ON CONFLICT DO NOTHING;

-- ─── vendor Admin ───────────────────────────────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'vendor' AND r.name = 'Admin'
  AND p.key IN ('vendor_profile.manage', 'vendor_bank.manage', 'vendor_docs.manage', 'vendor_users.manage')
ON CONFLICT DO NOTHING;

-- ─── vendor Manager ─────────────────────────────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'vendor' AND r.name = 'Manager'
  AND p.key IN ('quotations.submit', 'quotations.negotiate', 'purchase_orders.fulfill', 'invoices.submit')
ON CONFLICT DO NOTHING;

-- ─── vendor Associate ───────────────────────────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'vendor' AND r.name = 'Associate'
  AND p.key IN ('deliveries.confirm', 'quotations.draft_line_items')
ON CONFLICT DO NOTHING;
