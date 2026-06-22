// Middleware: pastikan user sudah login
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).redirect('/login');
  }
  next();
}

// Middleware: pastikan user adalah admin
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).redirect('/login');
  }
  next();
}

module.exports = { requireAuth, requireAdmin };