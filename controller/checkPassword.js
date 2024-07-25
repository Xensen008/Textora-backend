const UserModel = require("../models/user.model")
const bcryptjs = require("bcryptjs")
const jwt = require("jsonwebtoken")
async function checkPassword(req, res) {
    try {
        const { password, userId } = req.body
        const user = await UserModel.findById(userId)
        console.log(user)
        const verifyPassword = await bcryptjs.compare(password, user.password)
        if (!verifyPassword) {
            return res.status(400).json({
                message: "Password does not match",
                error: true
            })
        }
        //generate token
        const tokenData = {
            id: user._id,
            email: user.email
        }
        const token = await jwt.sign(tokenData, process.env.JWT_SECRET_KEY, { expiresIn: "7d" })

        // const cookieOption = {
        //     http: true,
        //     secure: true,
        // }
        res.setHeader("Set-Cookie", [
            `token=${token}; Max-Age=${7*24*60*60}; Path =/; HttpOnly; Secure; SameSite=None`,
              ]);

        return res.status(200).json({
            message: "Login success",
            error: false,
            token: token
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true
        })
    }
}

module.exports = checkPassword