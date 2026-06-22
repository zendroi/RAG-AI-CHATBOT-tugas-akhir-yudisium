class AuthController {
    redirectIfLoggedIn(req, res) {
        if (!req.session.user) return false;
        res.redirect(req.session.user.role === 'admin' ? '/admin' : '/chat');
        return true;
    }

    login(req, res, path) {
        if (this.redirectIfLoggedIn(req, res)) return;
        res.sendFile(path.join(__dirname, '../Public/pages/auth/', 'login.html'));
    }

    register(req, res, path) {
        if (this.redirectIfLoggedIn(req, res)) return;
        res.sendFile(path.join(__dirname, '../Public/pages/auth/', 'register.html'));
    }
}

module.exports = AuthController;