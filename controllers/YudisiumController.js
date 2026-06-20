
class YudisiumController {
    index(req, res, path) {
        res.sendFile(path.join(__dirname, '../Public/pages/yudisium.html'));
    }
}

module.exports = YudisiumController;