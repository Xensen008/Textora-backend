const mongoose = require("mongoose")


const messageSchema = new mongoose.Schema({
    text :{
        type:String,
        default:""
    },
    imageUrl :{
        type:String,
        default:""
    },
    videoUrl :{
        type: mongoose.Schema.ObjectId,
        default : ""
    },
    seen:{
        type:Boolen,
        default:false
    }
},{
    timestamps: true
})
const convoSchema = new mongoose.Schema({
    sender:{
        type: mongoose.Schema.ObjectId,
        required: true,
        ref: "User"
    },
    receiver:{
        type: mongoose.Schema.ObjectId,
        required: true,
        ref: "User"
    },
    message:{
        type: mongose.Schema.ObjectId,
        required: true,
        ref: "User"
    },
},{
    timestamps: true

})
const ConvoModel = mongoose.model("Conversation", convoSchema);
const MessageModel = mongoose.model("Message", messageSchema);

module.exports = {
    MessageModel,
    ConvoModel
}
