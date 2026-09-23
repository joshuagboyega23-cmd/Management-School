const bcrypt = require('bcryptjs');
const pool = require('./db');
require('dotenv').config();

async function createAdmin() {
  const args = process.argv.slice(2);
  const email = args[0] || 'admin@pinnacleheights.edu.ng';
  const password = args[1] || 'Admin123!';
  const fullName = args[2] || 'System Administrator';
  const role = args[3] || 'ADMIN';

  console.log(`\n========================================`);
  console.log(`Creating Admin Account...`);
  console.log(`Full Name: ${fullName}`);
  console.log(`Email:     ${email}`);
  console.log(`Password:  ${password}`);
  console.log(`Role:      ${role}`);
  console.log(`========================================\n`);

  try {
    const existing = await pool.query('SELECT id, email, role FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log(`⚠️ User with email ${email} already exists! Updating password and role to ${role}...`);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      await pool.query(
        'UPDATE users SET password_hash = $1, role = $2, full_name = $3 WHERE email = $4',
        [hashedPassword, role, fullName, email]
      );
      console.log(`✅ Admin account updated successfully!\n`);
    } else {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      const res = await pool.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, full_name, email, role, created_at`,
        [fullName, email, hashedPassword, role]
      );
      console.log(`✅ Admin account created successfully! User ID: ${res.rows[0].id}\n`);
    }
  } catch (error) {
    console.error('❌ Failed to create admin account:', error.message);
  } finally {
    await pool.end();
  }
}

createAdmin();

