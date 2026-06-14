
class TugasAkhirController {
    index(req, res, path) {
        res.sendFile(path.join(__dirname, '../Public/pages/tugasAkhir.html'));
    }
}

module.exports = TugasAkhirController;