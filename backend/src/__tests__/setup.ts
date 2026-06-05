// Set required env vars before any module loads
process.env.JWT_ACCESS_SECRET = "test-access-secret-that-is-long-enough-for-testing-purposes-abcdef"
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-long-enough-for-testing-purposes-xyz"
process.env.SUPABASE_URL = "https://test.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
process.env.FRONTEND_URL = "http://localhost:5173"
process.env.ADMIN_EMAIL = "admin@test.com"
process.env.NODE_ENV = "test"
