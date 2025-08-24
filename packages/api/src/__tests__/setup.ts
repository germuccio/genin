import 'dotenv/config'

// Test environment setup
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/invoice_test'
process.env.VISMA_CLIENT_ID = 'test_client_id'
process.env.VISMA_CLIENT_SECRET = 'test_client_secret'
process.env.VISMA_REDIRECT_URI = 'http://localhost:3000/test/callback'
process.env.VISMA_BASE_URL = 'https://api.test.com'



