-- ─── Default Service Categories ───────────────────────────────────────────────
INSERT INTO service_categories (name, description) VALUES
  ('IT & Software', 'Software development, IT support, cloud services, cybersecurity'),
  ('Marketing & Design', 'Branding, digital marketing, graphic design, content creation'),
  ('Legal & Compliance', 'Legal counsel, regulatory compliance, contract management'),
  ('Finance & Accounting', 'Bookkeeping, auditing, tax advisory, payroll'),
  ('Human Resources', 'Recruitment, training, HR consulting, staffing'),
  ('Facilities & Maintenance', 'Cleaning, repairs, building maintenance, security'),
  ('Logistics & Delivery', 'Courier services, warehousing, freight, last-mile delivery'),
  ('Catering & Events', 'Corporate catering, event management, hospitality'),
  ('Printing & Stationery', 'Business cards, brochures, office supplies, promotional items'),
  ('Consulting & Advisory', 'Business strategy, management consulting, research')
ON CONFLICT (name) DO NOTHING;

-- ─── Admin User ───────────────────────────────────────────────────────────────
-- After creating an admin user via Supabase Auth dashboard or via the API,
-- manually update their role in the profiles table:
--
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@yourdomain.com';
--
-- OR run this SQL in the Supabase SQL editor after the user has signed up:
-- UPDATE profiles SET role = 'admin', full_name = 'Admin User'
-- WHERE email = 'admin@yourdomain.com';
