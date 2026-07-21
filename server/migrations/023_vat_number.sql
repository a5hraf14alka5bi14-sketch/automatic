-- Migration 023: Add VAT registration number to restaurant settings.
-- Required for Oman tax-compliant VAT invoices (OTA registration number
-- issued by the Oman Tax Authority, typically formatted as OM followed by digits).
-- Stored as an empty string by default — the receipt only renders it when set.
INSERT INTO settings (key, value) VALUES ('vat_number', '')
  ON CONFLICT (key) DO NOTHING;
