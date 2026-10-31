-- Why: billing periods are counted from an anchor date. Without a pause the anchor is the start
-- date; a pause shifts it by the days paused, so after resuming, periods restart from the shifted
-- date (paused 10 days in January → later periods run 11th to 11th, not 1st to 1st).
-- start_date stays the real contract start; billing_anchor only drives period boundaries.
ALTER TABLE subscriptions ADD COLUMN billing_anchor DATE;

-- Subscriptions already scheduled for billing anchor on their start date (none have been paused yet).
UPDATE subscriptions SET billing_anchor = start_date WHERE next_billing_date IS NOT NULL;
