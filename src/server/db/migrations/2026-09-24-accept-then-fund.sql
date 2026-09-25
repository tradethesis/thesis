-- Accept-then-fund (23 Sep 2026): a gift can wait for its recipient to sign in with X before it is
-- funded, so sending never depends on a paid X API lookup.
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/server/db/migrations/2026-09-24-accept-then-fund.sql
BEGIN;
ALTER TABLE gift DROP CONSTRAINT IF EXISTS gift_state_values;
ALTER TABLE gift ADD CONSTRAINT gift_state_values CHECK (state IN (
  'draft','awaiting_recipient','recipient_resolved','wallet_provisioned','funding_pending','reconciling','funded',
  'claim_reserved','delivering','claimed','claimed_partial','cancelled','failed'));

ALTER TABLE gift DROP CONSTRAINT IF EXISTS gift_state_requires;
ALTER TABLE gift ADD CONSTRAINT gift_state_requires CHECK (
  (state IN ('draft','awaiting_recipient','cancelled') OR recipient_subject IS NOT NULL)
  AND (state IN ('draft','awaiting_recipient','recipient_resolved','cancelled') OR destination_wallet IS NOT NULL)
  AND (state NOT IN ('funding_pending','reconciling') OR funding_signature IS NOT NULL)
  AND (state NOT IN ('funded','claim_reserved','delivering','claimed','claimed_partial')
       OR (funding_signature IS NOT NULL AND funded_at IS NOT NULL))
  AND (state NOT IN ('claim_reserved','delivering','claimed','claimed_partial') OR claimed_by_provider_user_id IS NOT NULL)
  AND (state NOT IN ('claimed','claimed_partial') OR (claim_intent_id IS NOT NULL AND claimed_at IS NOT NULL))
);
-- Waiting for the recipient is still before payment: accepting sets who and where, which is the point.
CREATE OR REPLACE FUNCTION gift_terms_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state NOT IN ('draft','awaiting_recipient','recipient_resolved','wallet_provisioned') AND (
       NEW.basket_version_id IS DISTINCT FROM OLD.basket_version_id OR
       NEW.amount_raw        IS DISTINCT FROM OLD.amount_raw OR
       NEW.sender_wallet     IS DISTINCT FROM OLD.sender_wallet OR
       NEW.recipient_subject IS DISTINCT FROM OLD.recipient_subject OR
       NEW.destination_wallet IS DISTINCT FROM OLD.destination_wallet OR
       NEW.center_image_id   IS DISTINCT FROM OLD.center_image_id OR
       (OLD.funding_signature IS NOT NULL AND NEW.funding_signature IS DISTINCT FROM OLD.funding_signature)
     ) THEN
    RAISE EXCEPTION 'gift % terms are frozen once payment has been requested', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

COMMIT;
