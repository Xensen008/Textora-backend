const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const userDataToken = require('../utils/extractToken');
const UserModel = require('../models/user.model');
const { ConvoModel, MessageModel } = require('../models/convo.model');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO server with CORS settings
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true
    }
});

// Set to keep track of online users
const onlineUsers = new Set();

io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);

    const token = socket.handshake.auth.token;
    const user = await userDataToken(token);

    // Join a room for the connected user
    socket.join(user._id.toString());
    onlineUsers.add(user._id.toString());

    // Notify all users about the online status
    io.emit('onlineUsers', Array.from(onlineUsers));

    socket.on('message-page', async (userId) => {
        const userDetails = await UserModel.findById(userId).select("-password");
        const payload = {
            _id: userDetails._id,
            name: userDetails.name,
            email: userDetails.email,
            profile_pic: userDetails.profile_pic,
            online: onlineUsers.has(userId.toString()),
        };
        socket.emit('message-user', payload);
    });

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

    socket.on("disconnect", () => {
        onlineUsers.delete(user._id.toString());
        console.log("User disconnected:", socket.id);
    });
});

module.exports = { app, server };