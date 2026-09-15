CREATE TABLE IF NOT EXISTS thesis_call (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL UNIQUE REFERENCES thesis_version(id),
  statement text NOT NULL,
  benchmark text NOT NULL,
  duration_days smallint NOT NULL CHECK (duration_days BETWEEN 1 AND 365),
  rules text NOT NULL,
  holdings jsonb NOT NULL,
  benchmark_holding jsonb NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  start_snapshot jsonb NOT NULL,
  latest_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','hit','miss','tie','unresolved')),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION protect_thesis_call() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Published calls cannot be deleted'; END IF;
  IF OLD.status <> 'open' THEN RAISE EXCEPTION 'Resolved calls cannot be changed'; END IF;
  IF ROW(NEW.id, NEW.version_id, NEW.statement, NEW.benchmark, NEW.duration_days, NEW.rules,
    NEW.holdings, NEW.benchmark_holding, NEW.starts_at, NEW.ends_at, NEW.start_snapshot)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.version_id, OLD.statement, OLD.benchmark, OLD.duration_days, OLD.rules,
    OLD.holdings, OLD.benchmark_holding, OLD.starts_at, OLD.ends_at, OLD.start_snapshot)
  THEN RAISE EXCEPTION 'Published call rules and starting observations are immutable'; END IF;
  IF (NEW.latest_snapshot->>'observedAt')::timestamptz < (OLD.latest_snapshot->>'observedAt')::timestamptz
  THEN RAISE EXCEPTION 'Call observations cannot move backwards'; END IF;
  IF NEW.status IN ('hit','miss','tie') THEN
    IF (NEW.latest_snapshot->>'startedAt')::timestamptz < NEW.ends_at OR
       (NEW.latest_snapshot->>'observedAt')::timestamptz > NEW.ends_at + interval '48 hours'
    THEN RAISE EXCEPTION 'Resolution requires a complete observation in the deadline window'; END IF;
    IF NEW.status <> (CASE
      WHEN (NEW.latest_snapshot->>'basketUsdcRaw')::numeric * (NEW.start_snapshot->>'benchmarkUsdcRaw')::numeric >
           (NEW.latest_snapshot->>'benchmarkUsdcRaw')::numeric * (NEW.start_snapshot->>'basketUsdcRaw')::numeric THEN 'hit'
      WHEN (NEW.latest_snapshot->>'basketUsdcRaw')::numeric * (NEW.start_snapshot->>'benchmarkUsdcRaw')::numeric <
           (NEW.latest_snapshot->>'benchmarkUsdcRaw')::numeric * (NEW.start_snapshot->>'basketUsdcRaw')::numeric THEN 'miss'
      ELSE 'tie' END)
    THEN RAISE EXCEPTION 'Call result must match its observed relative return'; END IF;
  END IF;
  IF NEW.status = 'unresolved' AND now() <= NEW.ends_at + interval '48 hours'
  THEN RAISE EXCEPTION 'The resolution window has not ended'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_thesis_call ON thesis_call;
CREATE TRIGGER protect_thesis_call BEFORE UPDATE OR DELETE ON thesis_call
  FOR EACH ROW EXECUTE FUNCTION protect_thesis_call();
