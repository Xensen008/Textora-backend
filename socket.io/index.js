const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const app = express();
const userDataToken = require('../utils/extractToken')  
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
    onlineUser.add(user?._id)

    io.emit('onlineUser', Array.from(onlineUser))

    // Handle socket disconnection
    socket.on("disconnect", () => {
        onlineUser.delete(user?._id)
        console.log("User disconnected:", socket.id);
    });
});

// Export the Express app and HTTP server
module.exports = { app, server };