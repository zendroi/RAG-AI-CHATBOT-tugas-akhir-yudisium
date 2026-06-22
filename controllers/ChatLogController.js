class ChatLogController {
    index(req, res, path) {
        res.sendFile(path.join(__dirname, '../Public/pages/chatlog.html'));
    }
}

module.exports = ChatLogController;