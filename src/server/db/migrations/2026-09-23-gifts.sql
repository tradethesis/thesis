-- Funded gifts: the server-owned record and its append-only ledger.
--
-- A reviewable migration, deliberately NOT chained into constraints.sql. `pnpm db:push` runs
-- constraints.sql against whatever DATABASE_URL is set, and a financial table should reach a
-- database because somebody chose to apply this file there — not as a side effect of refreshing
-- indexes. Apply with:
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/server/db/migrations/2026-09-23-gifts.sql
--
-- Idempotent: safe to run twice. Design and reasoning: docs/gifting.md, "Architecture decision".

BEGIN;

CREATE TABLE IF NOT EXISTS gift (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The invitation ID is 128 random bits shown once to the sender; only its hash is stored.
  invite_hash text NOT NULL UNIQUE,
  invite_expires_at timestamptz NOT NULL,

  state text NOT NULL DEFAULT 'draft',

  -- What is being given. The allocation version is immutable once the sender has been asked to pay.
  pack_id text NOT NULL,
  basket_version_id uuid NOT NULL REFERENCES basket_version(id),
  amount_usd integer NOT NULL,
  amount_raw numeric(20,0) NOT NULL,
  sol_allowance_lamports bigint NOT NULL,

  -- Who is giving. The wallet comes from a verified session, never the request body.
  sender_wallet text NOT NULL,
  sender_name text NOT NULL,
  note text NOT NULL DEFAULT '',

  -- Who it is for. The handle the sender typed is kept for display; the subject is the identity.
  recipient_handle_requested text NOT NULL,
  recipient_subject text,
  recipient_handle_at_resolution text,
  recipient_display_name text,
  recipient_provider_user_id text,
  destination_wallet text,

  -- Evidence.
  funding_signature text UNIQUE,
  funded_slot bigint,
  claimed_by_provider_user_id text,
  claim_intent_id uuid REFERENCES investment_intent(id),

  eligibility text NOT NULL DEFAULT 'unchecked',
  failure_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  funded_at timestamptz,
  claimed_at timestamptz
);

CREATE INDEX IF NOT EXISTS gift_by_sender ON gift (sender_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_by_recipient ON gift (recipient_subject) WHERE recipient_subject IS NOT NULL;
-- The reconciler's work queue.
CREATE INDEX IF NOT EXISTS gift_unsettled ON gift (updated_at) WHERE state IN ('funding_pending', 'reconciling', 'delivering');

ALTER TABLE gift DROP CONSTRAINT IF EXISTS gift_state_values;
ALTER TABLE gift ADD CONSTRAINT gift_state_values CHECK (state IN (
  'draft','recipient_resolved','wallet_provisioned','funding_pending','reconciling','funded',
  'claim_reserved','delivering','claimed','claimed_partial','cancelled','failed'));

ALTER TABLE gift DROP CONSTRAINT IF EXISTS gift_amount_range;
-- $1 for the beta, by product decision (23 Sep; it was $10 earlier that day). A gift purchase may go
-- under the engine's $75 basket floor only through a verified gift (giftPurchaseTerms in
-- src/server/gifts/service.ts); ordinary baskets keep $75.
ALTER TABLE gift ADD CONSTRAINT gift_amount_range CHECK (amount_usd BETWEEN 1 AND 1000);

-- The two amounts describe the same gift; they cannot drift apart.
ALTER TABLE gift DROP CONSTRAINT IF EXISTS gift_amount_agrees;
ALTER TABLE gift ADD CONSTRAINT gift_amount_agrees CHECK (amount_raw = amount_usd::numeric * 1000000);

ALTER TABLE gift DROP CONSTRAINT IF EXISTS gift_eligibility_values;
ALTER TABLE gift ADD CONSTRAINT gift_eligibility_values
  CHECK (eligibility IN ('unchecked','eligible','ineligible','unavailable'));

ALTER TABLE gift DROP CONSTRAINT IF EXISTS gift_wallet_shapes;
ALTER TABLE gift ADD CONSTRAINT gift_wallet_shapes CHECK (
  sender_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  AND (destination_wallet IS NULL OR destination_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'));

ALTER TABLE gift DROP CONSTRAINT IF EXISTS gift_note_length;
ALTER TABLE gift ADD CONSTRAINT gift_note_length CHECK (char_length(note) <= 240 AND char_length(sender_name) BETWEEN 1 AND 40);

-- What each state requires to be true. A row in a state without its evidence is a writer bug, and
-- it surfaces here instead of in a support ticket.
ALTER TABLE gift DROP CONSTRAINT IF EXISTS gift_state_requires;
ALTER TABLE gift ADD CONSTRAINT gift_state_requires CHECK (
  (state IN ('draft','cancelled') OR recipient_subject IS NOT NULL)
  AND (state IN ('draft','recipient_resolved','cancelled') OR destination_wallet IS NOT NULL)
  AND (state NOT IN ('funding_pending','reconciling') OR funding_signature IS NOT NULL)
  AND (state NOT IN ('funded','claim_reserved','delivering','claimed','claimed_partial')
       OR (funding_signature IS NOT NULL AND funded_at IS NOT NULL))
  AND (state NOT IN ('claim_reserved','delivering','claimed','claimed_partial') OR claimed_by_provider_user_id IS NOT NULL)
  AND (state NOT IN ('claimed','claimed_partial') OR (claim_intent_id IS NOT NULL AND claimed_at IS NOT NULL))
);

-- Once the sender has been shown a destination to pay, what is being paid for cannot change.
CREATE OR REPLACE FUNCTION gift_terms_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state NOT IN ('draft','recipient_resolved','wallet_provisioned') AND (
       NEW.basket_version_id IS DISTINCT FROM OLD.basket_version_id OR
       NEW.amount_raw        IS DISTINCT FROM OLD.amount_raw OR
       NEW.sender_wallet     IS DISTINCT FROM OLD.sender_wallet OR
       NEW.recipient_subject IS DISTINCT FROM OLD.recipient_subject OR
       NEW.destination_wallet IS DISTINCT FROM OLD.destination_wallet OR
       (OLD.funding_signature IS NOT NULL AND NEW.funding_signature IS DISTINCT FROM OLD.funding_signature)
     ) THEN
    RAISE EXCEPTION 'gift % terms are frozen once payment has been requested', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gift_terms_frozen_trg ON gift;
CREATE TRIGGER gift_terms_frozen_trg BEFORE UPDATE ON gift FOR EACH ROW EXECUTE FUNCTION gift_terms_frozen();

-- The ledger. One row per transition, never edited, never deleted. `detail` must not carry the
-- note or the recipient's handle: it is the audit trail, and it is what analytics would read.
CREATE TABLE IF NOT EXISTS gift_event (
  id bigserial PRIMARY KEY,
  gift_id uuid NOT NULL REFERENCES gift(id),
  idempotency_key text NOT NULL UNIQUE,
  from_state text,
  to_state text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gift_event_by_gift ON gift_event (gift_id, id);

CREATE OR REPLACE FUNCTION gift_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gift_event is append-only' USING ERRCODE = 'restrict_violation';
END $$;
DROP TRIGGER IF EXISTS gift_event_append_only_trg ON gift_event;
CREATE TRIGGER gift_event_append_only_trg BEFORE UPDATE OR DELETE ON gift_event
  FOR EACH ROW EXECUTE FUNCTION gift_event_append_only();

COMMIT;
