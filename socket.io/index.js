const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const app = express();
const userDataToken = require('../utils/extractToken');
const UserModel = require('../models/user.model');
const { ConvoModel, MessageModel } = require('../models/convo.model');
const { isValidObjectId } = require('mongoose');
const getConversation = require("../utils/getConversation");
require('dotenv').config();

const server = http.createServer(app);

// Initialize Socket.IO server with CORS settings
const io = new Server(server, {
    path: '/socket.io/',
    cors: {
        origin: [process.env.FRONTEND_URL, 'http://localhost:5173', '*'],
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"]
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    allowUpgrades: true,
    cookie: false
});

// Debug socket connection issues
io.engine.on("connection_error", (err) => {
    console.log("Connection error:", err.code, err.message, err.context);
});

// Online users set
const onlineUsers = new Set();

// Handle socket connection
io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);

    try {
        const token = socket?.handshake.auth.token;
        const user = await userDataToken(token);

        if (!user || !isValidObjectId(user._id)) {
            console.error('Invalid user data:', user);
            socket.disconnect();
            return;
        }

        const userId = user._id.toString();
        socket.join(userId);
        onlineUsers.add(userId);
        io.emit('onlineUser', Array.from(onlineUsers));

        socket.on('message-page', async (targetUserId) => {
            try {
                if (!isValidObjectId(targetUserId)) {
                    console.error('Invalid userId:', targetUserId);
                    socket.emit('error', 'Invalid userId');
                    return;
                }

                const userDetails = await UserModel.findById(targetUserId).select("-password");
                const payload = {
                    _id: userDetails?._id,
                    name: userDetails?.name,
                    email: userDetails?.email,
                    profile_pic: userDetails?.profile_pic,
                    online: onlineUsers.has(targetUserId),
                };

                const conversation = await ConvoModel.findOne({
                    "$or": [
                        { sender: userId, receiver: targetUserId },
                        { sender: targetUserId, receiver: userId },
                    ]
                }).populate('messages').sort({ updatedAt: -1 });

                socket.emit('message-user', {
                    user: payload,
                    conversationId: conversation?._id
                });

                socket.emit('message', {
                    messages: conversation ? conversation.messages : [],
                    conversationId: conversation?._id,
                    participants: {
                        sender: userId,
                        receiver: targetUserId
                    }
                });
            } catch (error) {
                console.error('Error handling message-page event:', error);
                socket.emit('error', 'Internal server error');
            }
        });

        socket.on("new message", async (data) => {
            try {
                if (!isValidObjectId(data.sender) || !isValidObjectId(data.receiver)) {
                    console.error('Invalid sender or receiver ID:', data);
                    socket.emit('error', 'Invalid sender or receiver ID');
                    return;
                }

                let conversation = await ConvoModel.findOne({
                    "$or": [
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

                // Create and save the new message
                const message = await new MessageModel({
                    text: data.text,
                    imageUrl: data.imageUrl,
                    videoUrl: data.videoUrl,
                    msgByUserId: data.msgByUserId,
                    conversationId: conversation._id,
                    seen: false
                }).save();

                // Update conversation with new message
                conversation.messages.push(message._id);
                conversation.lastMsg = message._id;
                conversation.lastMessageAt = new Date();
                await conversation.save();

                // Get updated conversation with populated messages
                const updatedConversation = await ConvoModel.findById(conversation._id)
                    .populate({
                        path: 'messages',
                        options: { sort: { 'createdAt': 1 } }
                    })
                    .populate('lastMsg')
                    .exec();

                // Send message update to both participants
                const messageUpdate = {
                    messages: updatedConversation.messages,
                    conversationId: conversation._id,
                    participants: {
                        sender: data.sender,
                        receiver: data.receiver
                    }
                };

                // Emit to sender
                socket.emit('message', messageUpdate);
                
                // Emit to receiver
                socket.to(data.receiver).emit('message', messageUpdate);

                // Update sidebar for both participants
                const conversationSender = await getConversation(data.sender);
                const conversationReceiver = await getConversation(data.receiver);

                socket.emit('conversation', {
                    conversations: conversationSender,
                    currentConversationId: conversation._id
                });
                
                socket.to(data.receiver).emit('conversation', {
                    conversations: conversationReceiver,
                    currentConversationId: conversation._id
                });

                console.log('Message sent successfully:', message);
            } catch (error) {
                console.error('Error handling new message event:', error);
                socket.emit('error', 'Internal server error');
            }
        });

        socket.on('sidebar', async (currentUserId) => {
            try {
                if (!isValidObjectId(currentUserId)) {
                    console.error('Invalid currentUserId:', currentUserId);
                    socket.emit('error', 'Invalid currentUserId');
                    return;
                }
                const conversations = await getConversation(currentUserId);
                socket.emit('conversation', {
                    conversations: conversations,
                    currentConversationId: null
                });
            } catch (error) {
                console.error('Error handling sidebar event:', error);
                socket.emit('error', 'Internal server error');
            }
        });

        socket.on('seen', async (msgByUserId) => {
            try {
                if (!isValidObjectId(msgByUserId)) {
                    console.error('Invalid msgByUserId:', msgByUserId);
                    return;
                }

                const conversation = await ConvoModel.findOne({
                    "$or": [
                        { sender: msgByUserId, receiver: userId },
                        { sender: userId, receiver: msgByUserId },
                    ]
                });

                if (!conversation) {
                    console.error('Conversation not found');
                    return;
                }

                const conversationMessageIds = conversation.messages || [];
                await MessageModel.updateMany({
                    _id: { $in: conversationMessageIds },
                    msgByUserId: { $ne: userId },
                    seen: false,
                }, { seen: true });

                const conversationSender = await getConversation(userId);
                const conversationReceiver = await getConversation(msgByUserId);

                io.to(userId).emit('conversation', {
                    conversations: conversationSender,
                    currentConversationId: conversation._id
                });
                
                io.to(msgByUserId).emit('conversation', {
                    conversations: conversationReceiver,
                    currentConversationId: conversation._id
                });

                // Update the messages in the current conversation
                const updatedConversation = await ConvoModel.findById(conversation._id)
                    .populate('messages')
                    .sort({ updatedAt: -1 });

                io.to(userId).emit('message', {
                    messages: updatedConversation.messages,
                    conversationId: conversation._id,
                    participants: {
                        sender: userId,
                        receiver: msgByUserId
                    }
                });

                io.to(msgByUserId).emit('message', {
                    messages: updatedConversation.messages,
                    conversationId: conversation._id,
                    participants: {
                        sender: msgByUserId,
                        receiver: userId
                    }
                });

                io.to(msgByUserId).emit('messages-seen', userId);
            } catch (error) {
                console.error('Error handling seen event:', error);
            }
        });

        socket.on("disconnect", () => {
            onlineUsers.delete(userId);
            console.log("User disconnected:", socket.id);
            io.emit('onlineUser', Array.from(onlineUsers));
        });

    } catch (error) {
        console.error('Error during socket connection:', error);
        socket.disconnect();
    }
});

// Export the Express app and HTTP server
module.exports = { app, server };