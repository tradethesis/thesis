-- Gift photos and build-your-own packs.
--
-- Like 2026-09-23-gifts.sql, deliberately NOT chained into constraints.sql: apply it on purpose,
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/server/db/migrations/2026-09-24-gift-images.sql
--
-- after 2026-09-23-gifts.sql. Idempotent: safe to run twice.

BEGIN;

-- A sender's photo for the middle of the pack. Stored here rather than with a new vendor: after the
-- browser re-encodes it (src/lib/gift-image.ts) it is a few hundred kilobytes at most, and it is read
-- by unguessable id only. Takedown is setting removed_at; the image endpoint then answers 404.
CREATE TABLE IF NOT EXISTS gift_image (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256 text NOT NULL UNIQUE,
  mime text NOT NULL,
  bytes bytea NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  uploaded_by_wallet text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE INDEX IF NOT EXISTS gift_image_by_uploader ON gift_image (uploaded_by_wallet, created_at DESC);

ALTER TABLE gift_image DROP CONSTRAINT IF EXISTS gift_image_mime_values;
ALTER TABLE gift_image ADD CONSTRAINT gift_image_mime_values CHECK (mime IN ('image/webp', 'image/jpeg'));
ALTER TABLE gift_image DROP CONSTRAINT IF EXISTS gift_image_size;
ALTER TABLE gift_image ADD CONSTRAINT gift_image_size CHECK (octet_length(bytes) BETWEEN 100 AND 300000);
ALTER TABLE gift_image DROP CONSTRAINT IF EXISTS gift_image_dimensions;
ALTER TABLE gift_image ADD CONSTRAINT gift_image_dimensions CHECK (width BETWEEN 16 AND 2048 AND height BETWEEN 16 AND 2048);

ALTER TABLE gift ADD COLUMN IF NOT EXISTS center_image_id uuid REFERENCES gift_image(id);

-- A pack somebody built: presentation over their own published thesis. The basket, its holdings and
-- its allocation are the thesis's; this row only names and colours it.
CREATE TABLE IF NOT EXISTS gift_pack_design (
  thesis_slug text PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL,
  created_by_wallet text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gift_pack_design DROP CONSTRAINT IF EXISTS gift_pack_design_color_values;
ALTER TABLE gift_pack_design ADD CONSTRAINT gift_pack_design_color_values CHECK (color IN ('blue','green','red','gold'));
ALTER TABLE gift_pack_design DROP CONSTRAINT IF EXISTS gift_pack_design_name_length;
ALTER TABLE gift_pack_design ADD CONSTRAINT gift_pack_design_name_length CHECK (char_length(name) BETWEEN 3 AND 70);

-- The photo is part of what the recipient is promised, so it freezes with the other terms.
CREATE OR REPLACE FUNCTION gift_terms_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state NOT IN ('draft','recipient_resolved','wallet_provisioned') AND (
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
