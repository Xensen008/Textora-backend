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
        
        // Notify all clients about the new online user
        io.emit('user_status_change', { userId: currentUserId, status: 'online' });
        io.emit('onlineUser', Array.from(onlineUsers));

        // Handle get-online-users request
        socket.on('get-online-users', () => {
            socket.emit('onlineUser', Array.from(onlineUsers));
        });

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

                const currentUser = await UserModel.findById(currentUserId).populate('blockedUsers');
                const userDetails = await UserModel.findById(targetUserId).select("-password");
                
                // Check if user is blocked
                const isBlocked = currentUser.blockedUsers.some(
                    blockedUser => blockedUser._id.toString() === targetUserId
                );

                const payload = {
                    _id: userDetails?._id,
                    name: userDetails?.name,
                    email: userDetails?.email,
                    profile_pic: userDetails?.profile_pic,
                    isBlocked
                };

                // Send current online status immediately when opening chat
                socket.emit('user_status_change', { 
                    userId: targetUserId, 
                    status: onlineUsers.has(targetUserId) ? 'online' : 'offline' 
                });

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
                        messages: isBlocked ? [] : updatedConversation.messages,
                        conversationId: updatedConversation._id,
                        participants: {
                            sender: currentUserId,
                            receiver: targetUserId
                        },
                        isBlocked
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

                // Get both users to check blocking status
                const [sender, receiver] = await Promise.all([
                    UserModel.findById(data.sender).populate('blockedUsers'),
                    UserModel.findById(data.receiver).populate('blockedUsers')
                ]);

                // Check if receiver has blocked sender
                const isBlockedByReceiver = receiver.blockedUsers.some(
                    blockedUser => blockedUser._id.toString() === data.sender
                );

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

                // Create and save the new message
                const message = await new MessageModel({
                    text: data.text,
                    imageUrl: data.imageUrl,
                    videoUrl: data.videoUrl,
                    msgByUserId: data.msgByUserId,
                    conversationId: conversation._id,
                    seen: false
                }).save();

                // Update conversation
                conversation.messages.push(message._id);
                conversation.lastMsg = message._id;
                conversation.lastMessageAt = new Date();
                await conversation.save();

                // Get updated conversation
                const updatedConversation = await ConvoModel.findById(conversation._id)
                    .populate({
                        path: 'messages',
                        options: { sort: { 'createdAt': 1 } }
                    })
                    .populate('lastMsg')
                    .populate('sender')
                    .populate('receiver')
                    .exec();

                // Always send message back to sender
                socket.emit('message', {
                    messages: updatedConversation.messages,
                    conversationId: conversation._id,
                    participants: {
                        sender: data.sender,
                        receiver: data.receiver
                    }
                });

                // Only send to receiver if they haven't blocked the sender
                if (!isBlockedByReceiver) {
                    const isReceiverActive = activeConversations.get(data.receiver) === conversation._id.toString();
                    if (isReceiverActive) {
                        socket.to(data.receiver).emit('message', {
                            messages: updatedConversation.messages,
                            conversationId: conversation._id,
                            participants: {
                                sender: data.sender,
                                receiver: data.receiver
                            }
                        });
                    }
                }

                // Update conversations for both users
                const [conversationSender, conversationReceiver] = await Promise.all([
                    getConversation(data.sender),
                    getConversation(data.receiver)
                ]);

                socket.emit('conversations', {
                    conversations: conversationSender,
                    currentConversationId: activeConversations.get(data.sender)
                });

                // Only update receiver's conversation list if they haven't blocked the sender
                if (!isBlockedByReceiver) {
                    socket.to(data.receiver).emit('conversations', {
                        conversations: conversationReceiver,
                        currentConversationId: activeConversations.get(data.receiver)
                    });
                }
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

        // Handle message deletion
        socket.on('delete_message', async ({ messageId, conversationId }) => {
            try {
                if (!isValidObjectId(messageId) || !isValidObjectId(conversationId)) {
                    socket.emit('error', 'Invalid message or conversation ID');
                    return;
                }

                // Find and verify the message
                const message = await MessageModel.findById(messageId);
                if (!message) {
                    socket.emit('error', 'Message not found');
                    return;
                }
                
                if (message.msgByUserId.toString() !== currentUserId) {
                    socket.emit('error', 'Unauthorized to delete this message');
                    return;
                }

                // Mark message as deleted
                message.deleted = true;
                await message.save();
                console.log('Message marked as deleted:', messageId);

                // Update conversation
                const conversation = await ConvoModel.findById(conversationId);
                if (!conversation) {
                    socket.emit('error', 'Conversation not found');
                    return;
                }

                // If this was the last message, update lastMsg to the previous non-deleted message
                if (conversation.lastMsg && conversation.lastMsg.toString() === messageId) {
                    const messages = await MessageModel.find({
                        _id: { $in: conversation.messages },
                        deleted: { $ne: true }
                    }).sort({ createdAt: -1 }).limit(1);
                    
                    conversation.lastMsg = messages[0]?._id || null;
                    await conversation.save();
                }

                // Get updated conversation with populated fields
                const updatedConversation = await ConvoModel.findById(conversationId)
                    .populate({
                        path: 'messages',
                        options: { sort: { 'createdAt': 1 } }
                    })
                    .populate('lastMsg')
                    .exec();

                // Get both users' IDs from the conversation
                const otherUserId = conversation.sender.toString() === currentUserId 
                    ? conversation.receiver.toString() 
                    : conversation.sender.toString();

                // Prepare message payload
                const messagePayload = {
                    messages: updatedConversation.messages,
                    conversationId: conversation._id,
                    deletedMessageId: messageId
                };

                console.log('Sending delete update to users:', currentUserId, otherUserId);
                console.log('Message payload:', messagePayload);

                // Emit to both users
                socket.emit('message', messagePayload);
                io.to(otherUserId).emit('message', messagePayload);

                // Update conversation lists for both users
                const [conversationSender, conversationReceiver] = await Promise.all([
                    getConversation(currentUserId),
                    getConversation(otherUserId)
                ]);

                socket.emit('conversations', {
                    conversations: conversationSender,
                    currentConversationId: conversationId
                });
                
                io.to(otherUserId).emit('conversations', {
                    conversations: conversationReceiver,
                    currentConversationId: conversationId
                });

                // Send success response
                socket.emit('delete_success', { messageId });
                
                // Force immediate update for receiver
                io.to(otherUserId).emit('force_message_update', { 
                    messageId,
                    conversationId
                });
            } catch (error) {
                console.error('Error deleting message:', error);
                socket.emit('error', 'Failed to delete message');
            }
        });

        // Handle force message update
        socket.on('force_message_update', ({ messageId, conversationId, receiverId }) => {
            if (receiverId) {
                io.to(receiverId).emit('force_message_update', { 
                    messageId,
                    conversationId
                });
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            if (currentUserId) {
                onlineUsers.delete(currentUserId);
                // Notify all clients about the user going offline
                io.emit('user_status_change', { userId: currentUserId, status: 'offline' });
                io.emit('onlineUser', Array.from(onlineUsers));
            }
            console.log('User disconnected:', socket.id);
        });

        // Handle block user
        socket.on('block_user', async ({ userIdToBlock }) => {
            try {
                if (!isValidObjectId(userIdToBlock)) {
                    socket.emit('error', 'Invalid user ID');
                    return;
                }

                // Add user to blocked list
                const updatedUser = await UserModel.findByIdAndUpdate(
                    currentUserId,
                    { $addToSet: { blockedUsers: userIdToBlock } },
                    { new: true }
                );

                if (!updatedUser) {
                    socket.emit('error', 'Failed to block user');
                    return;
                }

                socket.emit('block_success', { blockedUserId: userIdToBlock });

                // Update conversations to reflect blocked status
                const conversations = await getConversation(currentUserId);
                socket.emit('conversations', {
                    conversations,
                    currentConversationId: activeConversations.get(currentUserId)
                });
            } catch (error) {
                console.error('Error blocking user:', error);
                socket.emit('error', 'Failed to block user');
            }
        });

        // Handle unblock user
        socket.on('unblock_user', async ({ userIdToUnblock }) => {
            try {
                if (!isValidObjectId(userIdToUnblock)) {
                    socket.emit('error', 'Invalid user ID');
                    return;
                }

                // Remove user from blocked list
                const updatedUser = await UserModel.findByIdAndUpdate(
                    currentUserId,
                    { $pull: { blockedUsers: userIdToUnblock } },
                    { new: true }
                );

                if (!updatedUser) {
                    socket.emit('error', 'Failed to unblock user');
                    return;
                }

                socket.emit('unblock_success', { unblockedUserId: userIdToUnblock });

                // Update conversations to reflect unblocked status
                const conversations = await getConversation(currentUserId);
                socket.emit('conversations', {
                    conversations,
                    currentConversationId: activeConversations.get(currentUserId)
                });
            } catch (error) {
                console.error('Error unblocking user:', error);
                socket.emit('error', 'Failed to unblock user');
            }
        });

    } catch (error) {
        console.error('Error during socket connection:', error);
        socket.disconnect();
    }
});

// Export the Express app and HTTP server
module.exports = { app, server };