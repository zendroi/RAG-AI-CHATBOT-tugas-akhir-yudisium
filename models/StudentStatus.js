const { pool } = require('../database/db');

const StudentStatus = {
  async getByUser(userId, jenis) {
    const [rows] = await pool.query(
      'SELECT * FROM student_status WHERE user_id = ? AND jenis = ?',
      [userId, jenis]
    );
    return rows[0];
  },

  async upsert(userId, jenis, payload) {
    const existing = await StudentStatus.getByUser(userId, jenis);
    const payloadJson = JSON.stringify(payload);

    if (existing) {
      await pool.query(
        'UPDATE student_status SET payload = ?, updated_at = NOW() WHERE id = ?',
        [payloadJson, existing.id]
      );
      return existing.id;
    }

    const [result] = await pool.query(
      'INSERT INTO student_status (user_id, jenis, payload) VALUES (?, ?, ?)',
      [userId, jenis, payloadJson]
    );
    return result.insertId;
  }
};

module.exports = StudentStatus;
