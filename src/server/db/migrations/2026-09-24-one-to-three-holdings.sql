-- One to three holdings per basket (23 Sep 2026), for packs people build themselves.
-- The same statements live in constraints.sql; this file applies just them, on purpose:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/server/db/migrations/2026-09-24-one-to-three-holdings.sql
BEGIN;
ALTER TABLE thesis_constituent DROP CONSTRAINT IF EXISTS constituent_weight_range;
ALTER TABLE thesis_constituent ADD CONSTRAINT constituent_weight_range CHECK (weight_bps BETWEEN 1000 AND 10000);
ALTER TABLE basket_constituent DROP CONSTRAINT IF EXISTS basket_constituent_weight_range;
ALTER TABLE basket_constituent ADD CONSTRAINT basket_constituent_weight_range CHECK (weight_bps BETWEEN 1000 AND 10000);
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
COMMIT;
