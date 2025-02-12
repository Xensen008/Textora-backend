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
    videoUrl: {
        type: String,
        default: ""
      },
    seen:{
        type:Boolean,
        default:false
    },
    deleted: {
        type: Boolean,
        default: false
    },
    msgByUserId:{
        type: mongoose.Schema.ObjectId,
        required: true,
        ref: 'User'
    },
    conversationId: {
        type: mongoose.Schema.ObjectId,
        required: true,
        ref: 'Conversation'
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
    messages:[{
        type: mongoose.Schema.ObjectId,
        ref: "Message"
    }],
    lastMsg: {
        type: mongoose.Schema.ObjectId,
        ref: "Message"
    },
    lastMessageAt: {
        type: Date,
        default: Date.now
    }
},{
    timestamps: true
})


const ConvoModel = mongoose.model("Conversation", convoSchema);
const MessageModel = mongoose.model("Message", messageSchema);

module.exports = {
    MessageModel,
    ConvoModel
}
