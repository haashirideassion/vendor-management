-- Notifications table for admin alerts
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('new_vendor', 'new_invoice', 'new_quotation')),
  title TEXT NOT NULL,
  message TEXT,
  module_reference_id UUID,
  is_read BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications(user_id, is_read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users mark own notifications read"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- ─── Trigger: notify admins when a new vendor is added ─────────────────────────

CREATE OR REPLACE FUNCTION notify_admins_new_vendor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, module_reference_id)
  SELECT
    p.id,
    'new_vendor',
    'New Vendor Added',
    'A new vendor application has been submitted: ' || NEW.company_name,
    NEW.id
  FROM profiles p
  WHERE p.role IN ('super_admin', 'admin', 'procurement_admin');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_vendor ON vendors;
CREATE TRIGGER trigger_new_vendor
  AFTER INSERT ON vendors
  FOR EACH ROW EXECUTE FUNCTION notify_admins_new_vendor();

-- ─── Trigger: notify admins when a new invoice is submitted ────────────────────

CREATE OR REPLACE FUNCTION notify_admins_new_invoice()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, module_reference_id)
  SELECT
    p.id,
    'new_invoice',
    'New Invoice Submitted',
    'A vendor has submitted a new invoice for review',
    NEW.id
  FROM profiles p
  WHERE p.role IN ('super_admin', 'admin', 'finance_ap');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_invoice ON invoices;
CREATE TRIGGER trigger_new_invoice
  AFTER INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION notify_admins_new_invoice();

-- ─── Trigger: notify admins when a quotation is submitted ──────────────────────

CREATE OR REPLACE FUNCTION notify_admins_new_quotation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'submitted' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'submitted') THEN
    INSERT INTO notifications (user_id, type, title, message, module_reference_id)
    SELECT
      p.id,
      'new_quotation',
      'New Quotation Received',
      'A vendor has submitted a quotation for an engagement',
      NEW.id
    FROM profiles p
    WHERE p.role IN ('super_admin', 'admin', 'procurement_admin');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_quotation_update ON quotations;
CREATE TRIGGER trigger_new_quotation_update
  AFTER UPDATE ON quotations
  FOR EACH ROW EXECUTE FUNCTION notify_admins_new_quotation();

DROP TRIGGER IF EXISTS trigger_new_quotation_insert ON quotations;
CREATE TRIGGER trigger_new_quotation_insert
  AFTER INSERT ON quotations
  FOR EACH ROW EXECUTE FUNCTION notify_admins_new_quotation();
