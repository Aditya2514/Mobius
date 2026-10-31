-- Why: billing and reports compare against CURRENT_DATE (overdue, revenue this month, days overdue).
-- Brightloop bills on Indian dates, so the database's "today" must be the Indian date, not UTC.
-- At 00:05 IST it is still the previous day in UTC. (Backend Blueprint section 7.)
-- Applies to whichever database this runs in (dev and test alike); new sessions pick it up.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Kolkata');
END
$$;
