const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const app = express();
const userDataToken = require('../utils/extractToken');
const UserModel = require('../models/user.model');
require('dotenv').config();
const { ConvoModel, MessageModel } = require('../models/convo.model');

const server = http.createServer(app);

// Initialize Socket.IO server with CORS settings
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true
    }
});
// online status
const onlineUser = new Set()

// Handle socket connection
io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);


    const token = socket?.handshake.auth.token;
    const user = await userDataToken(token);

    //create a room
    socket.join(user?._id?.toString());
    onlineUser.add(user?._id?.toString())

    io.emit('onlineUser', Array.from(onlineUser));

    socket.on('message-page', async (userId) => {
        // console.log('userId',userId)
        const userDetails = await UserModel.findById(userId).select("-password")

        const payload = {
            _id: userDetails?._id,
            name: userDetails?.name,
            email: userDetails?.email,
            profile_pic: userDetails?.profile_pic,
            online: onlineUser.has(userId),
        }
        socket.emit('message-user', payload)

        //get previous message load
        const getConversation = await ConvoModel.findOne({
            $or: [
                { sender: user?._id, receiver: userId },
                { sender: userId, receiver: user?._id },
            ]
        }).populate('messages').sort({ updatedAt: -1 });

        socket.emit('messages', getConversation.messages)

    })


    //new message
    socket.on("new message", async (data) => {
        let conversation = await ConvoModel.findOne({
            $or: [
                { sender: data?.sender, receiver: data?.receiver },
                { sender: data?.receiver, receiver: data?.sender },
            ]
        });

        if (!conversation) {
            const createConversation = await new ConvoModel({
                sender: data.sender,
                receiver: data.receiver,
            })
            conversation = await createConversation.save();
        }

        const message = new MessageModel({
            text: data.text,
            imageUrl: data.imageUrl,
            videoUrl: data.videoUrl,
            msgByUserId: data.msgByUserId,
        });

        const saveMessage = await message.save();

        const updatedConversation = await ConvoModel.updateOne({
            _id: conversation._id
        }, {
            $push: { messages: saveMessage._id }
        }, {
            new: true
        })

        const getConversation = await ConvoModel.findOne({
            $or: [
                { sender: data?.sender, receiver: data?.receiver },
                { sender: data?.receiver, receiver: data?.sender },
            ]
        }).populate('messages').sort({ updatedAt: -1 });

        io.to(data?.sender).emit('message', getConversation.messages);
        io.to(data.receiver).emit('message', getConversation.messages);
    });

    //sidebar
    socket.on("sidebar", async(currrentUserId) => {
        // console.log('sidebar', currrentUserId)

        const currrentUserConversation = await ConvoModel.find({
            $or: [
                { sender: currrentUserId },
                { receiver: currrentUserId }
            ]
        }).sort({ updatedAt: -1 }).populate('messages')
        
        // .populate('sender').populate('receiver');

        const conversation = currrentUserConversation.map((conv)=>{
            const countUnseenMsg = conv.messages.reduce((prev, curr) => prev + (curr.seen ? 0 : 1), 0);

            return {
                _id:conv?._id,
                sender:conv?.sender,
                receiver:conv?.receiver,
                unseenMsg: countUnseenMsg,
                lastMsg: conv?.messages[conv?.messages?.length - 1]
            }
        })

        socket.emit('conversation',conversation)
    })



        // Handle socket disconnection
        socket.on("disconnect", () => {
            onlineUser.delete(user?._id);
            console.log("User disconnected:", socket.id);
        });
    });

    // Export the Express app and HTTP server
    module.exports = { app, server };