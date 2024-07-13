const UserModel = require("../models/user.model")
const userDataToken = require("../utils/extractToken")

async function updateUser(req,res){
    try {
        const token = req.cookies.token || ""

        const user = await userDataToken(token)
        if (!user || !user._id) {
            return res.status(404).json({
                message: "User not found.",
                success: false
            });
        }
        const { name, profile_pic } = req.body;
        const updateResult = await UserModel.updateOne({ _id: user._id }, {
            name,
            profile_pic
        });

        if (updateResult.modifiedCount === 0) {
            return res.status(404).json({
                message: "User not found or data not changed.",
                success: false
            });
        }

        const userInfo = await UserModel.findById(user._id);
        if (!userInfo) {
            return res.status(404).json({
                message: "User not found after update.",
                success: false
            });
        }

        return res.json({
            message: "user updated successfully!",
            data:userInfo,
            success:true
        })
    } catch (error) {
        return res.status(500).json({
            message:error.message || error,
            error:true
        })
    }
}

module.exports = updateUser