const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const app = express();
const userDataToken = require('../utils/extractToken');  
const UserModel = require('../models/user.model');
require('dotenv').config(); 

const server = http.createServer(app);

// Initialize Socket.IO server with CORS settings
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true
    }
});
// online status
const onlineUser=  new Set()

// Handle socket connection
io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);

    
    const token = socket?.handshake.auth.token;
    const user = await userDataToken(token);
    
    //create a room
    socket.join(user?._id);
    onlineUser.add(user?._id?.toString())

    io.emit('onlineUser', Array.from(onlineUser));
    
    socket.on('message-page',async(userId)=>{
        // console.log('userId',userId)
        const userDetails= await UserModel.findById(userId).select("-password")

        const payload = {
            _id :userDetails?._id,
            name : userDetails?.name,
            email: userDetails?.email,
            profile_pic: userDetails?.profile_pic,
            online: onlineUser.has(userId),
        }
        socket.emit('message-user',payload)
        
    })

    socket.on("new message", async (data) => {
        let conversation = await ConvoModel.findOne({
            $or: [
                { sender: data.sender, receiver: data.receiver },
                { sender: data.receiver, receiver: data.sender },
            ]
        });

        if (!conversation) {
            conversation = await new ConvoModel({
                sender: data.sender,
                receiver: data.receiver,
            }).save();
        }

        const message = await MessageModel.create({
            text: data.text,
            imageUrl: data.imageUrl,
            videoUrl: data.videoUrl,
            msgByUserId: data.msgByUserId,
        });

        await ConvoModel.findByIdAndUpdate(conversation._id, {
            $push: { messages: message._id }
        }, { new: true });

        const updatedConversation = await ConvoModel.findOne({
            $or: [
                { sender: data.sender, receiver: data.receiver },
                { sender: data.receiver, receiver: data.sender },
            ]
        }).populate('messages').sort({ updatedAt: -1 });

        io.to(data.sender).emit('new message', updatedConversation.messages);
        io.to(data.receiver).emit('new message', updatedConversation.messages);
    });


    // Handle socket disconnection
    socket.on("disconnect", () => {
        onlineUser.delete(user?._id?.toString()); 
        console.log("User disconnected:", socket.id);
    });
});

// Export the Express app and HTTP server
module.exports = { app, server };