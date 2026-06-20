const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const User = require('../models/User');

// ===== REGISTER =====
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Semua field wajib diisi' });
    }

    // Cek apakah username/email sudah dipakai
    const existingUser = await User.findByUsernameOrEmail(username, email);
    if (existingUser) {
      return res.status(409).json({ message: 'Username atau email sudah terdaftar' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Simpan user baru
    await User.create({ username, email, hashedPassword });

    res.status(201).json({ message: 'Registrasi berhasil, silakan login' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

// ===== LOGIN =====
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email dan password wajib diisi' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Email atau password salah' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Email atau password salah' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    res.status(200).json({
      message: 'Login berhasil',
      user: req.session.user,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

// ===== LOGOUT =====
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Gagal logout' });
    }
    res.status(200).json({ message: 'Logout berhasil' });
  });
});

// ===== CEK SESSION =====
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Belum login' });
  }
  res.status(200).json({ user: req.session.user });
});

module.exports = router;