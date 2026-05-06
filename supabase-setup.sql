-- ============================================
-- 234MILE - SUPABASE DATABASE SCHEMA
-- ============================================
-- This SQL sets up the PostgreSQL database for 234Mile
-- Run this in your Supabase SQL Editor
-- ============================================

-- Create trips table
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_city TEXT NOT NULL,
    to_city TEXT NOT NULL,
    trip_date DATE NOT NULL,
    trip_time TEXT NOT NULL,
    price_per_seat INTEGER NOT NULL,
    total_seats INTEGER NOT NULL,
    phone_number TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_trips_from_city ON trips(from_city);
CREATE INDEX IF NOT EXISTS idx_trips_to_city ON trips(to_city);
CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(trip_date);
CREATE INDEX IF NOT EXISTS idx_trips_timestamp ON trips(timestamp);

-- Enable Row Level Security (RLS)
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to read trips
CREATE POLICY "Allow public read access" ON trips
    FOR SELECT
    USING (true);

-- Create policy to allow anyone to insert trips
CREATE POLICY "Allow public insert access" ON trips
    FOR INSERT
    WITH CHECK (true);

-- Create policy to allow anyone to delete trips
CREATE POLICY "Allow public delete access" ON trips
    FOR DELETE
    USING (true);

-- Create policy to allow anyone to update trips
CREATE POLICY "Allow public update access" ON trips
    FOR UPDATE
    USING (true);

-- Enable Realtime for trips table
-- This allows real-time subscriptions to work
ALTER PUBLICATION supabase_realtime ADD TABLE trips;

-- Function to auto-delete old trips (optional)
-- Trips older than 7 days will be automatically deleted
CREATE OR REPLACE FUNCTION delete_old_trips()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM trips
    WHERE trip_date < CURRENT_DATE - INTERVAL '7 days';
END;
$$;

-- Schedule the cleanup function (if using pg_cron extension)
-- Note: pg_cron needs to be enabled in your Supabase project
-- You can also call this function manually or via a cron job
-- SELECT cron.schedule('delete-old-trips', '0 2 * * *', 'SELECT delete_old_trips()');

-- Create a view for active trips (not expired)
CREATE OR REPLACE VIEW active_trips AS
SELECT *
FROM trips
WHERE trip_date >= CURRENT_DATE
ORDER BY trip_date, trip_time;

-- Grant access to the view
GRANT SELECT ON active_trips TO anon, authenticated;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify your setup:

-- Check if table exists
-- SELECT * FROM trips LIMIT 1;

-- Check if RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'trips';

-- Check policies
-- SELECT * FROM pg_policies WHERE tablename = 'trips';

-- ============================================
-- SAMPLE DATA (OPTIONAL - FOR TESTING)
-- ============================================
-- Uncomment to insert test data:

/*
INSERT INTO trips (from_city, to_city, trip_date, trip_time, price_per_seat, total_seats, phone_number, timestamp)
VALUES
    ('Lagos', 'Abuja', CURRENT_DATE + 1, '08:00', 12000, 4, '2348012345678', EXTRACT(EPOCH FROM NOW()) * 1000),
    ('Abuja', 'Lagos', CURRENT_DATE + 2, '14:00', 11000, 3, '2348087654321', EXTRACT(EPOCH FROM NOW()) * 1000),
    ('Port Harcourt', 'Lagos', CURRENT_DATE + 1, '10:00', 8000, 5, '2348123456789', EXTRACT(EPOCH FROM NOW()) * 1000);
*/

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Your Supabase database is now ready for 234Mile
-- Next steps:
-- 1. Note your Supabase URL and anon key
-- 2. Update the JavaScript files with these credentials
-- 3. Deploy your app
-- ============================================
