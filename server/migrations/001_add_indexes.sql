-- Performance indexes for large datasets
CREATE INDEX IF NOT EXISTS idx_timesheets_eid ON timesheets(eid);
CREATE INDEX IF NOT EXISTS idx_timesheets_date ON timesheets(date);
CREATE INDEX IF NOT EXISTS idx_timesheets_eid_date ON timesheets(eid, date);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);

CREATE INDEX IF NOT EXISTS idx_requests_eid ON requests(eid);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_date ON requests(date);
CREATE INDEX IF NOT EXISTS idx_requests_eid_status ON requests(eid, status);

CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE INDEX IF NOT EXISTS idx_geofences_active ON geofences(active);

CREATE INDEX IF NOT EXISTS idx_schedules_eid ON schedules(eid);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
CREATE INDEX IF NOT EXISTS idx_schedules_eid_date ON schedules(eid, date);
