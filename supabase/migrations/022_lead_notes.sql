-- Add notes column to leads for internal comments
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes text;
