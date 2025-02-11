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

// Track active conversations
const activeConversations = new Map(); // userId -> conversationId
const onlineUsers = new Set();

// Handle socket connection
io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);
    let currentUserId = null;

    try {
        const token = socket?.handshake.auth.token;
        const user = await userDataToken(token);

        if (!user || !isValidObjectId(user._id)) {
            console.error('Invalid user data:', user);
            socket.disconnect();
            return;
        }

        currentUserId = user._id.toString();
        socket.join(currentUserId);
        onlineUsers.add(currentUserId);
        io.emit('onlineUser', Array.from(onlineUsers));

        // Add handler for initial conversations request
        socket.on('get-conversations', async () => {
            try {
                const conversations = await getConversation(currentUserId);
                socket.emit('conversations', {
                    conversations,
                    currentConversationId: null
                });
            } catch (error) {
                console.error('Error fetching initial conversations:', error);
                socket.emit('error', 'Failed to fetch conversations');
            }
        });

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
                        { sender: currentUserId, receiver: targetUserId },
                        { sender: targetUserId, receiver: currentUserId },
                    ]
                }).populate('messages').sort({ updatedAt: -1 });

                if (conversation) {
                    // Store active conversation for this user
                    activeConversations.set(currentUserId, conversation._id.toString());

                    // Mark messages as seen
                    await MessageModel.updateMany({
                        conversationId: conversation._id,
                        msgByUserId: targetUserId,
                        seen: false
                    }, { seen: true });

                    // Get updated conversation
                    const updatedConversation = await ConvoModel.findById(conversation._id)
                        .populate('messages')
                        .populate('lastMsg')
                        .sort({ updatedAt: -1 });

                    socket.emit('message-user', {
                        user: payload,
                        conversationId: updatedConversation._id
                    });

                    socket.emit('message', {
                        messages: updatedConversation.messages,
                        conversationId: updatedConversation._id,
                        participants: {
                            sender: currentUserId,
                            receiver: targetUserId
                        }
                    });

                    // Update sidebar for both users
                    const [conversationSender, conversationReceiver] = await Promise.all([
                        getConversation(currentUserId),
                        getConversation(targetUserId)
                    ]);

                    socket.emit('conversations', {
                        conversations: conversationSender,
                        currentConversationId: updatedConversation._id
                    });
                    
                    socket.to(targetUserId).emit('conversations', {
                        conversations: conversationReceiver,
                        currentConversationId: updatedConversation._id
                    });

                    socket.to(targetUserId).emit('messages-seen', currentUserId);
                } else {
                    socket.emit('message-user', { user: payload, conversationId: null });
                    socket.emit('message', {
                        messages: [],
                        conversationId: null,
                        participants: { sender: currentUserId, receiver: targetUserId }
                    });
                }
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

                let isNewConversation = false;
                if (!conversation) {
                    isNewConversation = true;
                    conversation = await new ConvoModel({
                        sender: data.sender,
                        receiver: data.receiver,
                        messages: [],
                    }).save();
                }

                // Check if receiver is viewing this conversation
                const isReceiverActive = activeConversations.get(data.receiver) === conversation._id.toString();

                // Create and save the new message
                const message = await new MessageModel({
                    text: data.text,
                    imageUrl: data.imageUrl,
                    videoUrl: data.videoUrl,
                    msgByUserId: data.msgByUserId,
                    conversationId: conversation._id,
                    seen: isReceiverActive
                }).save();

                // Update conversation
                conversation.messages.push(message._id);
                conversation.lastMsg = message._id;
                conversation.lastMessageAt = new Date();
                await conversation.save();

                // Get updated conversation with populated fields
                const updatedConversation = await ConvoModel.findById(conversation._id)
                    .populate({
                        path: 'messages',
                        options: { sort: { 'createdAt': 1 } }
                    })
                    .populate('lastMsg')
                    .populate('sender')
                    .populate('receiver')
                    .exec();

                // Send message update to both users
                const messagePayload = {
                    messages: updatedConversation.messages,
                    conversationId: conversation._id,
                    participants: {
                        sender: data.sender,
                        receiver: data.receiver
                    }
                };

                // Always emit to sender
                socket.emit('message', messagePayload);
                
                // Emit to receiver if they're active
                if (isReceiverActive) {
                    socket.to(data.receiver).emit('message', messagePayload);
                }

                // Get updated conversations for both users
                const [conversationSender, conversationReceiver] = await Promise.all([
                    getConversation(data.sender),
                    getConversation(data.receiver)
                ]);

                // If it's a new conversation, force both users to update their conversation lists
                const senderActiveConvo = activeConversations.get(data.sender);
                const receiverActiveConvo = activeConversations.get(data.receiver);

                socket.emit('conversations', {
                    conversations: conversationSender,
                    currentConversationId: senderActiveConvo,
                    isNewConversation
                });
                
                socket.to(data.receiver).emit('conversations', {
                    conversations: conversationReceiver,
                    currentConversationId: receiverActiveConvo,
                    isNewConversation
                });

                if (isReceiverActive) {
                    socket.emit('messages-seen', data.receiver);
                }

                console.log('Message sent successfully:', message);
            } catch (error) {
                console.error('Error handling new message event:', error);
                socket.emit('error', 'Internal server error');
            }
        });

        // Handle conversation leave
        socket.on('leave-conversation', () => {
            if (currentUserId) {
                activeConversations.delete(currentUserId);
            }
        });

        socket.on("disconnect", () => {
            if (currentUserId) {
                onlineUsers.delete(currentUserId);
                activeConversations.delete(currentUserId);
                console.log("User disconnected:", socket.id);
                io.emit('onlineUser', Array.from(onlineUsers));
            }
        });

    } catch (error) {
        console.error('Error during socket connection:', error);
        socket.disconnect();
    }
});

// Export the Express app and HTTP server
module.exports = { app, server };