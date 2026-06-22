class UserChatController {

    index(req, res, path) {
        res.sendFile(path.join(__dirname, '../Public/pages/user/', 'chat.html'));
    }
}

module.exports = UserChatController;