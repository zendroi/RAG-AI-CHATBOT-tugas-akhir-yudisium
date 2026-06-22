class HomeController {
    index(req, res, path) {
        res.sendFile(path.join(__dirname, '../Public/pages/admin/home.html'));
    }
}

module.exports = HomeController;