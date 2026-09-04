ALTER TABLE entries ADD COLUMN card_purchase_id TEXT REFERENCES card_purchases(id) ON DELETE SET NULL;
ALTER TABLE entries ADD COLUMN card_installment_id TEXT REFERENCES card_installments(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_card_installment ON entries(card_installment_id) WHERE card_installment_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entries_card_purchase ON entries(card_purchase_id) WHERE card_purchase_id IS NOT NULL AND deleted_at IS NULL;
