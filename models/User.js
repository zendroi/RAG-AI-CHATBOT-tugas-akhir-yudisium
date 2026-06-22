const { pool } = require('../database/db');

const User = {
  // Cari user berdasarkan email
  async findByEmail(email) {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0];
  },

  // Cari user berdasarkan username atau email (untuk cek duplikat saat register)
  async findByUsernameOrEmail(username, email) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    return rows[0];
  },

  // Buat user baru
  async create({ username, email, hashedPassword, role = 'user' }) {
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, role]
    );
    return result.insertId;
  },
};

module.exports = User;