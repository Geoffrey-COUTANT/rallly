-- NULL preserves unlimited voting for existing polls.
ALTER TABLE "polls" ADD COLUMN "max_participants_per_option" INTEGER;
ALTER TABLE "polls" ADD CONSTRAINT "polls_option_capacity_positive"
CHECK ("max_participants_per_option" IS NULL OR "max_participants_per_option" > 0);
