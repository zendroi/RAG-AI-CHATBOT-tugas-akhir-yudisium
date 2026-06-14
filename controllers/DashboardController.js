
class DashboardController {
    index(req, res, path) {
        res.sendFile(path.join(__dirname, '../Public/pages/dashboard.html'));
    }
}

module.exports = DashboardController;