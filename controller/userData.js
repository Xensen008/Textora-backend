const userDataToken = require("../utils/extractToken")

async function userData(req,res){
    try {
        const token = req.cookies.token || ""

        const user = await userDataToken(token)
        console.log(user)
        return res.status(200).json({
            message:"user details",
            data:user
        })
    } catch (error) {
        return res.status(500).json({
            message:error.message || error,
            error:true
        })
    }
}

module.exports = userData