const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'saas_user',
  password: process.env.DB_PASS || 'saas_password',
  database: process.env.DB_NAME || 'saas_db',
  port: 5432,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  pool,
};
