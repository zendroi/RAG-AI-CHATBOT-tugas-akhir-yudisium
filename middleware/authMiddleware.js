// Middleware: pastikan user sudah login
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Silakan login dulu' });
  }
  next();
}

// Middleware: pastikan user adalah admin
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ message: 'Akses ditolak, khusus admin' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };