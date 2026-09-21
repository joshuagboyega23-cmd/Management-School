const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const initializeDb = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Connected to Neon Cloud PostgreSQL Database!');

    const sqlPath = path.join(__dirname, 'init.sql');
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await client.query(sql);
      console.log('✅ Database schema initialized successfully (init.sql).');
    }
    client.release();
  } catch (error) {
    console.error('❌ Database Initialization Error:', error.message);
  }
};

initializeDb();

// Export pool directly as default so 'const pool = require("./db")' works everywhere
module.exports = pool;