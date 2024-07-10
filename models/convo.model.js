const mongoose = require("mongoose")

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
const ConvoModel = mongoose.model("Convo", convoSchema);

module.exports = ConvoModel

