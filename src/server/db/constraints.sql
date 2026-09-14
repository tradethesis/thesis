-- Guarantees that belong in the database, not in a code path someone might forget at 2 a.m.
-- Applied by scripts/apply-constraints.sh after every drizzle-kit push.

/* ---- TH-14: a fixture asset cannot masquerade as a mainnet equity token ---- */
ALTER TABLE asset DROP CONSTRAINT IF EXISTS asset_equity_mint_prefix;
ALTER TABLE asset ADD CONSTRAINT asset_equity_mint_prefix
  CHECK (network = 'fixture' OR kind <> 'equity_token' OR left(mint, 2) = 'Xs');

ALTER TABLE asset DROP CONSTRAINT IF EXISTS asset_network_values;
ALTER TABLE asset ADD CONSTRAINT asset_network_values CHECK (network IN ('mainnet', 'fixture'));

/* ---- PRD §7: whole percentages, 10% floor, 70% ceiling ---- */
ALTER TABLE thesis_constituent DROP CONSTRAINT IF EXISTS constituent_weight_range;
ALTER TABLE thesis_constituent ADD CONSTRAINT constituent_weight_range
  CHECK (weight_bps BETWEEN 1000 AND 7000);

ALTER TABLE thesis_constituent DROP CONSTRAINT IF EXISTS constituent_weight_whole_percent;
ALTER TABLE thesis_constituent ADD CONSTRAINT constituent_weight_whole_percent
  CHECK (weight_bps % 100 = 0);

/* ---- PRD §5: one open intent, and one open position, per wallet ---- */
DROP INDEX IF EXISTS intent_one_open_per_wallet;
CREATE UNIQUE INDEX intent_one_open_per_wallet ON investment_intent (wallet)
  WHERE status IN ('draft','quoting','ready','executing','partial','needs_reconciliation');

DROP INDEX IF EXISTS position_one_open_per_wallet;
CREATE UNIQUE INDEX position_one_open_per_wallet ON position (wallet)
  WHERE state <> 'closed';

/* ---- TH-09 / TH-10: retry cannot duplicate a confirmed purchase ----
   A replacement leg is a NEW row (retry_of, attempt + 1). This index makes that row
   insertable only once the previous attempt is failed / expired / cancelled, so
   "cannot duplicate" is a constraint violation rather than a policy. */
DROP INDEX IF EXISTS swap_leg_one_live_per_asset;
CREATE UNIQUE INDEX swap_leg_one_live_per_asset ON swap_leg (intent_id, asset_id)
  WHERE status IN ('planned','quoted','awaiting_signature','submitted','unknown','confirmed');

DROP INDEX IF EXISTS swap_leg_derived_signature_key;
CREATE UNIQUE INDEX swap_leg_derived_signature_key ON swap_leg (derived_signature)
  WHERE derived_signature IS NOT NULL;

-- One Jupiter requestId is handed to /execute at most once as a new submission.
-- Resubmission reuses the same row, so it does not conflict.
DROP INDEX IF EXISTS swap_leg_request_id_key;
CREATE UNIQUE INDEX swap_leg_request_id_key ON swap_leg (quote_request_id)
  WHERE quote_request_id IS NOT NULL
    AND status IN ('awaiting_signature','submitted','unknown','confirmed');

/* ---- Status vocabularies, so a typo cannot invent a state ---- */
ALTER TABLE investment_intent DROP CONSTRAINT IF EXISTS intent_status_values;
ALTER TABLE investment_intent ADD CONSTRAINT intent_status_values CHECK (status IN
  ('draft','quoting','ready','executing','partial','complete','cancelled','needs_reconciliation'));

ALTER TABLE investment_intent DROP CONSTRAINT IF EXISTS intent_direction_values;
ALTER TABLE investment_intent ADD CONSTRAINT intent_direction_values CHECK (direction IN ('buy','sell'));

ALTER TABLE investment_intent DROP CONSTRAINT IF EXISTS intent_execution_mode_values;
ALTER TABLE investment_intent ADD CONSTRAINT intent_execution_mode_values
  CHECK (execution_mode IN ('live','simulation'));

ALTER TABLE swap_leg DROP CONSTRAINT IF EXISTS swap_leg_status_values;
ALTER TABLE swap_leg ADD CONSTRAINT swap_leg_status_values CHECK (status IN
  ('planned','quoted','awaiting_signature','submitted','confirmed','failed','expired','cancelled','unknown'));

ALTER TABLE position DROP CONSTRAINT IF EXISTS position_state_values;
ALTER TABLE position ADD CONSTRAINT position_state_values CHECK (state IN ('open','closing','closed'));

ALTER TABLE position DROP CONSTRAINT IF EXISTS position_attribution_values;
ALTER TABLE position ADD CONSTRAINT position_attribution_values
  CHECK (attribution_state IN ('clean','under_review'));

/* ---- TH-12: the sell flow can only ever touch what is left ---- */
ALTER TABLE position_holding DROP COLUMN IF EXISTS remaining_raw;
ALTER TABLE position_holding ADD COLUMN remaining_raw numeric(39,0)
  GENERATED ALWAYS AS (acquired_raw - disposed_raw) STORED;

ALTER TABLE position_holding DROP CONSTRAINT IF EXISTS holding_not_oversold;
ALTER TABLE position_holding ADD CONSTRAINT holding_not_oversold CHECK (disposed_raw <= acquired_raw);

/* ---- PRD §11: an incomplete valuation has no number, and never a zero ---- */
ALTER TABLE valuation DROP CONSTRAINT IF EXISTS valuation_incomplete_has_no_total;
ALTER TABLE valuation ADD CONSTRAINT valuation_incomplete_has_no_total
  CHECK (complete OR estimated_proceeds_raw IS NULL);

/* ---- TH-03: a published version is immutable ----
   PRD §6: "Published versions cannot be silently overwritten." This is the difference
   between "our code does not do that" and "it cannot happen". */
CREATE OR REPLACE FUNCTION thesis_version_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.published_at IS NOT NULL AND (
       NEW.claim            IS DISTINCT FROM OLD.claim OR
       NEW.summary          IS DISTINCT FROM OLD.summary OR
       NEW.rationale        IS DISTINCT FROM OLD.rationale OR
       NEW.counterargument  IS DISTINCT FROM OLD.counterargument OR
       NEW.change_my_mind   IS DISTINCT FROM OLD.change_my_mind OR
       NEW.horizon_label    IS DISTINCT FROM OLD.horizon_label OR
       NEW.review_date      IS DISTINCT FROM OLD.review_date OR
       NEW.evidence         IS DISTINCT FROM OLD.evidence OR
       NEW.content_hash     IS DISTINCT FROM OLD.content_hash OR
       NEW.thesis_id        IS DISTINCT FROM OLD.thesis_id OR
       NEW.version_number   IS DISTINCT FROM OLD.version_number
     ) THEN
    RAISE EXCEPTION 'thesis_version % is published and immutable; publish a new version instead', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS thesis_version_immutable_trg ON thesis_version;
CREATE TRIGGER thesis_version_immutable_trg BEFORE UPDATE ON thesis_version
  FOR EACH ROW EXECUTE FUNCTION thesis_version_immutable();

/* Constituents of a published version are part of that version. */
CREATE OR REPLACE FUNCTION thesis_constituent_immutable() RETURNS trigger AS $$
DECLARE published timestamptz;
BEGIN
  SELECT published_at INTO published FROM thesis_version
   WHERE id = COALESCE(NEW.version_id, OLD.version_id);
  IF published IS NOT NULL THEN
    RAISE EXCEPTION 'constituents of a published thesis_version cannot change'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS thesis_constituent_immutable_trg ON thesis_constituent;
CREATE TRIGGER thesis_constituent_immutable_trg
  BEFORE UPDATE OR DELETE ON thesis_constituent
  FOR EACH ROW EXECUTE FUNCTION thesis_constituent_immutable();
