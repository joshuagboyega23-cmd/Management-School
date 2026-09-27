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

    const migrationsPath = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsPath)) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const migrationFiles = fs.readdirSync(migrationsPath)
        .filter((filename) => filename.endsWith('.sql'))
        .sort();

      for (const filename of migrationFiles) {
        const applied = await client.query(
          'SELECT 1 FROM schema_migrations WHERE filename = $1',
          [filename]
        );
        if (applied.rows.length > 0) continue;

        await client.query('BEGIN');
        try {
          const migrationSql = fs.readFileSync(path.join(migrationsPath, filename), 'utf8');
          await client.query(migrationSql);
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
          await client.query('COMMIT');
          console.log(`✅ Database migration applied: ${filename}`);
        } catch (migrationError) {
          await client.query('ROLLBACK');
          throw migrationError;
        }
      }
    }

    client.release();
  } catch (error) {
    console.error('❌ Database Initialization Error:', error.message);
  }
};

initializeDb();

// Export pool directly as default so 'const pool = require("./db")' works everywhere
module.exports = pool;