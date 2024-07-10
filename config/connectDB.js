const mongoose = require("mongoose")

async function connectDB(){
    try {
        await mongoose.connect(process.env.MONGODB_URI)
        const connection = mongoose.connection

        connection.on('connected',()=>{
            console.log("connect to DB")
        })
        connection.on("error",(error)=>{
            console.log("error connecting db", error)
        })
    } catch (error) {
        console.log(error)
    }
}


module.exports = connectDB