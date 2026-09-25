-- Run by `pnpm db:push`, which chains it after drizzle-kit.
--
-- That chaining is not convenience, it is repair. Everything in this file is invisible to
-- drizzle-kit, so a bare `drizzle-kit push --force` reads these indexes and columns as
-- drift and drops them — including intent_one_open_per_wallet, the index that is the only
-- thing stopping a wallet opening a second basket while the first is still settling.
-- Never run drizzle-kit directly against a database that matters.

-- Guarantees that belong in the database, not in a code path someone might forget at 2 a.m.
-- Applied by scripts/apply-constraints.sh after every drizzle-kit push.

/* ---- TH-14: a fixture asset cannot masquerade as a mainnet equity token ---- */
ALTER TABLE asset DROP CONSTRAINT IF EXISTS asset_equity_mint_prefix;
ALTER TABLE asset ADD CONSTRAINT asset_equity_mint_prefix
  CHECK (network = 'fixture' OR kind <> 'equity_token' OR left(mint, 2) = 'Xs');

ALTER TABLE asset DROP CONSTRAINT IF EXISTS asset_network_values;
ALTER TABLE asset ADD CONSTRAINT asset_network_values CHECK (network IN ('mainnet', 'fixture'));

/* ---- PRD §7: whole percentages, 10% floor. The ceiling depends on how many holdings there are
   (1 → 100%, 2 → 90%, 3 → 70%; src/lib/money/allocate.ts weightBoundsBps), so the column allows
   the widest and basket_allocation_check below enforces the rest. ---- */
ALTER TABLE thesis_constituent DROP CONSTRAINT IF EXISTS constituent_weight_range;
ALTER TABLE thesis_constituent ADD CONSTRAINT constituent_weight_range
  CHECK (weight_bps BETWEEN 1000 AND 10000);

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

/* ---- conviction: a side is one of two things, and an owner is one of two kinds ---- */
CREATE TABLE IF NOT EXISTS conviction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES thesis(id),
  version_id uuid NOT NULL REFERENCES thesis_version(id),
  call_id uuid REFERENCES thesis_call(id),
  side text NOT NULL,
  owner_kind text NOT NULL,
  owner_key text NOT NULL,
  basket_key text NOT NULL,
  taken_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conviction DROP CONSTRAINT IF EXISTS conviction_side_values;
ALTER TABLE conviction ADD CONSTRAINT conviction_side_values
  CHECK (side IN ('backing', 'doubting'));

ALTER TABLE conviction DROP CONSTRAINT IF EXISTS conviction_owner_kind_values;
ALTER TABLE conviction ADD CONSTRAINT conviction_owner_kind_values
  CHECK (owner_kind IN ('wallet', 'anon'));

-- An owner key is opaque and bounded. A wallet is a base58 address; an anon id is the
-- random value the browser generated. Neither should ever be long enough to be a payload.
ALTER TABLE conviction DROP CONSTRAINT IF EXISTS conviction_owner_key_shape;
ALTER TABLE conviction ADD CONSTRAINT conviction_owner_key_shape
  CHECK (owner_key ~ '^[A-Za-z0-9_-]{8,64}$');

-- One live side per person per thesis. Switching sides rewrites the row.
CREATE UNIQUE INDEX IF NOT EXISTS conviction_one_per_owner
  ON conviction (owner_kind, owner_key, thesis_id);
CREATE INDEX IF NOT EXISTS conviction_by_thesis ON conviction (thesis_id);

/* ---- what people search for ----
   The demand log behind the homepage. It holds text somebody typed and the outcome of matching it,
   and deliberately holds nothing that identifies them — no wallet, no session, no address.

   Created here rather than by drizzle-kit, the same way `conviction` is. Pushing a brand new table
   in the same run that removed two others makes drizzle ask, interactively, whether this is a
   rename of one of them; there is no safe non-interactive answer to that question, and the wrong
   answer renames a table instead of creating one. */

CREATE TABLE IF NOT EXISTS match_query (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  input text NOT NULL,
  source_kind text NOT NULL,
  source_url text,
  idea text NOT NULL,
  outcome text NOT NULL,
  no_match boolean NOT NULL DEFAULT false,
  top_slug text,
  top_strength text,
  top_score numeric(4,3),
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_ms integer,
  questions integer
);

CREATE INDEX IF NOT EXISTS match_query_by_time ON match_query (created_at DESC);
-- The gap list is read constantly and is a small slice of the table.
CREATE INDEX IF NOT EXISTS match_query_gaps ON match_query (created_at DESC) WHERE no_match;

ALTER TABLE match_query DROP CONSTRAINT IF EXISTS match_query_outcome_values;
ALTER TABLE match_query ADD CONSTRAINT match_query_outcome_values
  CHECK (outcome IN ('ok','unretrievable','unavailable','empty_catalogue','error'));

ALTER TABLE match_query DROP CONSTRAINT IF EXISTS match_query_source_kind_values;
ALTER TABLE match_query ADD CONSTRAINT match_query_source_kind_values
  CHECK (source_kind IN ('text','post'));

-- A no-match is only meaningful for a run that finished matching. Anything else that claims one is
-- a bug in the writer, and this is where it surfaces rather than in a chart three weeks later.
ALTER TABLE match_query DROP CONSTRAINT IF EXISTS match_query_nomatch_needs_ok;
ALTER TABLE match_query ADD CONSTRAINT match_query_nomatch_needs_ok
  CHECK (NOT no_match OR outcome = 'ok');

ALTER TABLE match_query DROP CONSTRAINT IF EXISTS match_query_top_score_range;
ALTER TABLE match_query ADD CONSTRAINT match_query_top_score_range
  CHECK (top_score IS NULL OR (top_score >= 0 AND top_score <= 1));

/* ---- thesis tokens: removed 22 September 2026 ----
   `thesis_token_config` and `thesis_token` stood here, for a paired Meteora bonding-curve token
   per thesis with 50.4% of its trading fee split to the author. The whole feature is gone. Both
   tables were empty in every environment, so nothing was lost.

   This file only CREATEs; it never DROPs a table. The two empty tables therefore still exist in
   any database that was pushed before today, harmlessly. `pnpm db:push` is what would drop them,
   and running that is the operator's call, not this file's. */

-- A creator wallet is a Solana address or it is absent. There is no third state: this column is
-- the byline, and a malformed one attributes a basket to nobody. It outlived the token feature
-- that first needed it.
ALTER TABLE thesis DROP CONSTRAINT IF EXISTS thesis_creator_wallet_shape;
ALTER TABLE thesis ADD CONSTRAINT thesis_creator_wallet_shape
  CHECK (creator_wallet IS NULL OR creator_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

/* ================================================================== baskets */
/* Everything for the basket parent lives in THIS file. src/server/calls/schema.sql is the
   cautionary example: its guards are applied only by `pnpm tsx scripts/calls.ts migrate`, so
   they are invisible to the one command anybody actually runs, and a live database can be
   missing them without anyone noticing. */

/* basket and basket_version reference each other, so a non-deferrable FK makes the pair
   uninsertable. Deferring to COMMIT lets one transaction write both. Drizzle cannot express
   DEFERRABLE, which is why thesis.current_version_id has no FK at all — this closes that gap
   for the pointer that actually decides what gets bought. */
ALTER TABLE basket DROP CONSTRAINT IF EXISTS basket_execution_version_fk;
ALTER TABLE basket ADD CONSTRAINT basket_execution_version_fk
  FOREIGN KEY (execution_version_id) REFERENCES basket_version(id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE basket DROP CONSTRAINT IF EXISTS basket_status_values;
ALTER TABLE basket ADD CONSTRAINT basket_status_values CHECK (status IN ('draft','live','retired'));

-- A live basket that cannot name what a buy would execute is a buy button with no basket.
ALTER TABLE basket DROP CONSTRAINT IF EXISTS basket_live_has_execution_version;
ALTER TABLE basket ADD CONSTRAINT basket_live_has_execution_version
  CHECK (status <> 'live' OR execution_version_id IS NOT NULL);

-- Two to four words. One word is a ticker; five is a headline. Neither is a thing a reader can
-- hold in their head beside nine others.
ALTER TABLE basket DROP CONSTRAINT IF EXISTS basket_name_shape;
ALTER TABLE basket ADD CONSTRAINT basket_name_shape
  CHECK (name ~ '^\S+( \S+){1,3}$' AND char_length(name) BETWEEN 3 AND 40);

ALTER TABLE basket DROP CONSTRAINT IF EXISTS basket_description_shape;
ALTER TABLE basket ADD CONSTRAINT basket_description_shape
  CHECK (description !~ '[\n\r]' AND char_length(description) BETWEEN 20 AND 200);

ALTER TABLE basket DROP CONSTRAINT IF EXISTS basket_slug_shape;
ALTER TABLE basket ADD CONSTRAINT basket_slug_shape CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE basket DROP CONSTRAINT IF EXISTS basket_chain_values;
ALTER TABLE basket ADD CONSTRAINT basket_chain_values CHECK (chain IN ('solana'));

ALTER TABLE basket DROP CONSTRAINT IF EXISTS basket_author_wallet_shape;
ALTER TABLE basket ADD CONSTRAINT basket_author_wallet_shape
  CHECK (allocation_author_wallet IS NULL
         OR allocation_author_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

ALTER TABLE basket_version DROP CONSTRAINT IF EXISTS basket_version_state_values;
ALTER TABLE basket_version ADD CONSTRAINT basket_version_state_values
  CHECK (state IN ('draft','live','superseded'));

ALTER TABLE basket_version DROP CONSTRAINT IF EXISTS basket_version_chain_values;
ALTER TABLE basket_version ADD CONSTRAINT basket_version_chain_values CHECK (chain IN ('solana'));

-- One live allocation per basket. With the pointer trigger below, this is what makes "there is
-- exactly one allocation a buy can use" a fact rather than a convention.
DROP INDEX IF EXISTS basket_version_one_live;
CREATE UNIQUE INDEX basket_version_one_live ON basket_version (basket_id) WHERE state = 'live';

-- A performance series belongs to one allocation. Two versions claiming one call is how a
-- re-weighted basket inherits returns it never earned.
DROP INDEX IF EXISTS basket_version_one_call;
CREATE UNIQUE INDEX basket_version_one_call ON basket_version (call_id) WHERE call_id IS NOT NULL;

DROP INDEX IF EXISTS basket_thesis_one_origin;
CREATE UNIQUE INDEX basket_thesis_one_origin ON basket_thesis (basket_version_id) WHERE role = 'origin';

ALTER TABLE basket_thesis DROP CONSTRAINT IF EXISTS basket_thesis_role_values;
ALTER TABLE basket_thesis ADD CONSTRAINT basket_thesis_role_values CHECK (role IN ('origin','argument'));

-- The same bounds as thesis_constituent, for the same PRD reason. Duplicated rather than shared
-- because these are the rows the order path reads.
ALTER TABLE basket_constituent DROP CONSTRAINT IF EXISTS basket_constituent_weight_range;
ALTER TABLE basket_constituent ADD CONSTRAINT basket_constituent_weight_range
  CHECK (weight_bps BETWEEN 1000 AND 10000);
ALTER TABLE basket_constituent DROP CONSTRAINT IF EXISTS basket_constituent_weight_whole_percent;
ALTER TABLE basket_constituent ADD CONSTRAINT basket_constituent_weight_whole_percent
  CHECK (weight_bps % 100 = 0);

DROP INDEX IF EXISTS basket_span_one_open;
CREATE UNIQUE INDEX basket_span_one_open ON basket_execution_span (basket_id) WHERE ended_at IS NULL;

/* ---- the allocation a version claims is the allocation it holds ----
   Deferred: the version row and its three constituents are written in one transaction and
   neither order should be forced on the caller.

   COLLATE "C" is not decoration. src/lib/basket.ts sorts in JavaScript by code unit; this
   database's default collation is case-insensitive and base58 mints are mixed case. The two
   orders disagree on 21 of this catalogue's 68 versions, and the only symptom of a mismatch is
   a basket that silently reads as changed. */
CREATE OR REPLACE FUNCTION basket_allocation_check(v_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE expected text; recomputed text; n int; total int;
BEGIN
  SELECT allocation_key INTO expected FROM basket_version WHERE id = v_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*), coalesce(sum(bc.weight_bps), 0),
         coalesce(string_agg(bc.mint || ':' || bc.weight_bps, '|' ORDER BY bc.mint COLLATE "C"), '')
    INTO n, total, recomputed
    FROM basket_constituent bc WHERE bc.basket_version_id = v_id;

  IF n NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'basket_version % has % constituents, 1 to 3 required', v_id, n
      USING ERRCODE = 'check_violation';
  END IF;
  -- Three holdings keep the original 70% ceiling; with one or two, the sum rule bounds them.
  IF n = 3 AND EXISTS (SELECT 1 FROM basket_constituent bc WHERE bc.basket_version_id = v_id AND bc.weight_bps > 7000) THEN
    RAISE EXCEPTION 'basket_version % has a holding over 70%% of three', v_id USING ERRCODE = 'check_violation';
  END IF;
  IF total <> 10000 THEN
    RAISE EXCEPTION 'basket_version % weights sum to % bps, must be 10000', v_id, total
      USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM basket_constituent bc
       WHERE bc.basket_version_id = v_id AND bc.position BETWEEN 0 AND n - 1) <> n THEN
    RAISE EXCEPTION 'basket_version % positions must run 0 to %', v_id, n - 1 USING ERRCODE = 'check_violation';
  END IF;
  IF recomputed IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'basket_version % claims allocation % but holds %', v_id, expected, recomputed
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM basket_constituent bc JOIN asset a ON a.id = bc.asset_id
              WHERE bc.basket_version_id = v_id
                AND (a.mint <> bc.mint OR a.network <> 'mainnet' OR NOT a.enabled)) THEN
    RAISE EXCEPTION 'basket_version % holds a disabled, non-mainnet, or re-pointed asset', v_id
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION basket_version_allocation_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM basket_allocation_check(NEW.id); RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION basket_constituent_allocation_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM basket_allocation_check(COALESCE(NEW.basket_version_id, OLD.basket_version_id)); RETURN NULL; END $$;

DROP TRIGGER IF EXISTS basket_version_allocation_valid ON basket_version;
CREATE CONSTRAINT TRIGGER basket_version_allocation_valid
  AFTER INSERT OR UPDATE ON basket_version DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION basket_version_allocation_trg();

DROP TRIGGER IF EXISTS basket_constituent_allocation_valid ON basket_constituent;
CREATE CONSTRAINT TRIGGER basket_constituent_allocation_valid
  AFTER INSERT OR UPDATE OR DELETE ON basket_constituent DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION basket_constituent_allocation_trg();

/* ---- a published allocation is immutable, and its series is chosen once ---- */
CREATE OR REPLACE FUNCTION basket_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state <> 'draft' THEN
      RAISE EXCEPTION 'basket_version % is published and cannot be deleted', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.state <> 'draft' AND
     ROW(NEW.basket_id, NEW.version_number, NEW.chain, NEW.allocation_key) IS DISTINCT FROM
     ROW(OLD.basket_id, OLD.version_number, OLD.chain, OLD.allocation_key) THEN
    RAISE EXCEPTION 'basket_version % is published; publish a new version instead', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.call_id IS NOT NULL AND NEW.call_id IS DISTINCT FROM OLD.call_id THEN
    RAISE EXCEPTION 'basket_version % already has a performance series', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS basket_version_immutable_trg ON basket_version;
CREATE TRIGGER basket_version_immutable_trg BEFORE UPDATE OR DELETE ON basket_version
  FOR EACH ROW EXECUTE FUNCTION basket_version_immutable();

CREATE OR REPLACE FUNCTION basket_constituent_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT state INTO st FROM basket_version WHERE id = COALESCE(NEW.basket_version_id, OLD.basket_version_id);
  IF st IS NOT NULL AND st <> 'draft' THEN
    RAISE EXCEPTION 'constituents of a published basket_version cannot change'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS basket_constituent_immutable_trg ON basket_constituent;
CREATE TRIGGER basket_constituent_immutable_trg BEFORE UPDATE OR DELETE ON basket_constituent
  FOR EACH ROW EXECUTE FUNCTION basket_constituent_immutable();

/* ---- the series must measure THIS allocation ----
   thesis_call.holdings is frozen by protect_thesis_call, so this compares against a value that
   cannot move underneath it. A call pointed at the wrong allocation is a real, correct,
   immutable ninety-day series shown under a basket it never measured — and nothing else in the
   system would notice. */
CREATE OR REPLACE FUNCTION basket_version_call_matches() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE call_key text;
BEGIN
  IF NEW.call_id IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce(string_agg((h->>'mint') || ':' || (h->>'weightBps'),
                             '|' ORDER BY (h->>'mint') COLLATE "C"), '')
    INTO call_key
    FROM thesis_call tc CROSS JOIN LATERAL jsonb_array_elements(tc.holdings) h
   WHERE tc.id = NEW.call_id;
  IF call_key IS DISTINCT FROM NEW.allocation_key THEN
    RAISE EXCEPTION 'call % measures % but basket_version % is %',
      NEW.call_id, call_key, NEW.id, NEW.allocation_key USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.call_selection_reason IS NULL THEN
    RAISE EXCEPTION 'a chosen performance series must record why it was chosen'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS basket_version_call_matches_trg ON basket_version;
CREATE TRIGGER basket_version_call_matches_trg BEFORE INSERT OR UPDATE ON basket_version
  FOR EACH ROW EXECUTE FUNCTION basket_version_call_matches();

/* ---- an attached argument holds the allocation it is attached to ----
   Deferred, because publishSeed writes the version, its constituents and the attachment in one
   transaction. This is the guard that stops the page rendering one basket while the buy path
   builds another. */
CREATE OR REPLACE FUNCTION basket_thesis_allocation_matches() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tkey text; bkey text; s text; an text;
BEGIN
  SELECT th.slug, th.author_name INTO s, an
    FROM thesis_version tv JOIN thesis th ON th.id = tv.thesis_id
   WHERE tv.id = NEW.thesis_version_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Development fixtures never cleared a gate on the way in; they must never occupy an
  -- allocation identity a real thesis would then be told to attach to.
  IF s LIKE 'fixture-%' OR an = 'Thesis fixtures' THEN
    RAISE EXCEPTION 'development fixture % may not be attached to a basket', s
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(string_agg(a.mint || ':' || c.weight_bps, '|' ORDER BY a.mint COLLATE "C"), '')
    INTO tkey FROM thesis_constituent c JOIN asset a ON a.id = c.asset_id
   WHERE c.version_id = NEW.thesis_version_id;
  SELECT allocation_key INTO bkey FROM basket_version WHERE id = NEW.basket_version_id;

  IF tkey IS DISTINCT FROM bkey THEN
    RAISE EXCEPTION 'thesis_version % holds % which is not basket_version %''s allocation %',
      NEW.thesis_version_id, tkey, NEW.basket_version_id, bkey USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS basket_thesis_allocation_valid ON basket_thesis;
CREATE CONSTRAINT TRIGGER basket_thesis_allocation_valid
  AFTER INSERT OR UPDATE ON basket_thesis DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION basket_thesis_allocation_matches();

/* ---- the execution pointer points at a live version of this basket ---- */
CREATE OR REPLACE FUNCTION basket_execution_pointer_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner uuid; st text;
BEGIN
  IF NEW.execution_version_id IS NULL THEN RETURN NULL; END IF;
  SELECT basket_id, state INTO owner, st FROM basket_version WHERE id = NEW.execution_version_id;
  IF owner IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'execution version % belongs to basket %, not %', NEW.execution_version_id, owner, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF st <> 'live' THEN
    RAISE EXCEPTION 'execution version % is %, not live', NEW.execution_version_id, st
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS basket_execution_pointer_trg ON basket;
CREATE CONSTRAINT TRIGGER basket_execution_pointer_trg
  AFTER INSERT OR UPDATE ON basket DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION basket_execution_pointer_valid();

/* ---- moving the pointer IS the history ----
   Written by a trigger rather than by application code, so the pointer and the audit record are
   the same write. The backfill inserts closed spans directly with real timestamps and lets this
   open the current one. */
CREATE OR REPLACE FUNCTION basket_execution_span_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reason text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.execution_version_id IS NOT DISTINCT FROM OLD.execution_version_id
    THEN RETURN NULL; END IF;
  IF NEW.execution_version_id IS NULL THEN RETURN NULL; END IF;
  UPDATE basket_execution_span SET ended_at = now() WHERE basket_id = NEW.id AND ended_at IS NULL;
  SELECT change_reason INTO reason FROM basket_version WHERE id = NEW.execution_version_id;
  INSERT INTO basket_execution_span (basket_id, basket_version_id, started_at, change_reason)
  VALUES (NEW.id, NEW.execution_version_id, now(), reason);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS basket_execution_span_trg ON basket;
CREATE TRIGGER basket_execution_span_trg AFTER INSERT OR UPDATE ON basket
  FOR EACH ROW EXECUTE FUNCTION basket_execution_span_record();

CREATE OR REPLACE FUNCTION basket_execution_span_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'basket execution history cannot be deleted'; END IF;
  IF OLD.ended_at IS NOT NULL THEN RAISE EXCEPTION 'a closed execution span is immutable'; END IF;
  IF ROW(NEW.basket_id, NEW.basket_version_id, NEW.started_at) IS DISTINCT FROM
     ROW(OLD.basket_id, OLD.basket_version_id, OLD.started_at)
    THEN RAISE EXCEPTION 'basket execution history cannot be rewritten'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS basket_execution_span_append_only_trg ON basket_execution_span;
CREATE TRIGGER basket_execution_span_append_only_trg BEFORE UPDATE OR DELETE ON basket_execution_span
  FOR EACH ROW EXECUTE FUNCTION basket_execution_span_append_only();

/* ---- a buy names its allocation ----
   The column is nullable because the table already had rows and cannot be SET NOT NULL. A BEFORE
   INSERT trigger is the same guarantee for everything written from here on.

   The matching guards for `thesis_token` were removed with that feature. */

CREATE OR REPLACE FUNCTION intent_names_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.basket_version_id IS NULL THEN
    RAISE EXCEPTION 'an investment intent must name the basket version it executes'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS intent_names_allocation_trg ON investment_intent;
CREATE TRIGGER intent_names_allocation_trg BEFORE INSERT ON investment_intent
  FOR EACH ROW EXECUTE FUNCTION intent_names_allocation();
