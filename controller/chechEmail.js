const UserModel = require("../models/user.model")
async function checkEmail(req,res){
    try {
        const {email}= req.body

        const checkEmail = await UserModel.findOne({email}).select("-password")

        if (!checkEmail){
            return res.status(400).json({
                message : "User does not exist",
                error :true
            })
        }

        return res.status(200).json({
            message:"User exist",
            data: checkEmail,
            success: true
        })

    } catch (error) {
        return res.status(500).json({
            message:error.message,
            error:true
        })
    }
}

module.exports = checkEmail