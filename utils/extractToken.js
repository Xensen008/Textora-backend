const jwt = require("jsonwebtoken")
const UserModel = require("../models/user.model")
const userDataToken = async(token)=>{
    if(!token){
        return {
            message:"session out!",
            logout:true
        }
    }
    const decodeToken= await jwt.verify(token,process.env.JWT_SECRET_KEY)
    const user= await UserModel.findById(decodeToken.id).select("-password")

    return user
}

module.exports= userDataToken