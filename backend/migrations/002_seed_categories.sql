-- Seed default service categories
INSERT INTO service_categories (name, description, is_active)
VALUES
  ('Information Technology (IT) Services',   'IT infrastructure, support, managed services, and cloud solutions',                    true),
  ('Software & SaaS Solutions',              'Software licenses, SaaS subscriptions, and custom software development',               true),
  ('Hardware & Networking Equipment',        'Servers, workstations, networking devices, and peripherals',                           true),
  ('Cybersecurity Services',                 'Security audits, penetration testing, SOC services, and compliance consulting',        true),
  ('Human Resources & Staffing Services',    'Recruitment, temporary staffing, payroll processing, and HR consulting',               true),
  ('Professional Consulting Services',       'Management consulting, strategy advisory, and business process improvement',           true),
  ('Marketing & Advertising Services',       'Digital marketing, branding, creative design, and media buying',                      true),
  ('Finance, Accounting & Audit Services',   'Bookkeeping, financial auditing, tax consulting, and treasury services',               true),
  ('Legal & Compliance Services',            'Legal counsel, contract management, regulatory compliance, and risk advisory',         true),
  ('Logistics & Transportation Services',    'Freight, courier, warehousing, and last-mile delivery solutions',                     true),
  ('Procurement & General Supplies',         'Office supplies, consumables, and general procurement services',                      true),
  ('Facilities Management & Maintenance',    'Building maintenance, cleaning, HVAC, and property management',                       true),
  ('Security & Surveillance Services',       'Physical security, CCTV, access control, and guard services',                        true),
  ('Construction & Engineering Services',    'Civil works, fit-out, MEP engineering, and project management',                       true),
  ('Training & Learning Services',           'Corporate training, e-learning platforms, certifications, and coaching',               true)
ON CONFLICT (name) DO NOTHING;
