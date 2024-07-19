const UserModel = require('../models/user.model');

async function searchUser(req, res) {
    try {
        const { search } = req.body;
        const query = new RegExp(search, 'i'); 
        const users = await UserModel.find({ $or: [{ name: query }, { email: query }] });
        return res.status(200).json({ message: 'Users found', data: users, success: true }); // Corrected 'succes' to 'success'

    } catch (error) {
        return res.status(500).json({ message: error.message || error, error: true });
    }
}

module.exports = searchUser;