const express = require("express");
const cors = require("cors");
const connectDB = require("./config/connectDB");
const router = require("./routers/auth.route");
const cookiesParser = require("cookie-parser");
const { app, server } = require("./socket.io/index"); // Ensure this correctly initializes express
require('dotenv').config();

// Middleware
app.use(cors({
    origin: [process.env.FRONTEND_URL, 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(cookiesParser());

// Root route
app.get("/", (req, res) => {
    res.send("Welcome to our application!"); // More professional message
});

// API endpoints
app.use("/api", router);

// Error handling middleware (basic example)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Database connection and server start
(async () => {
    try {
        await connectDB();
        server.listen(process.env.PORT || 8080, () => {
            console.log(`Server running at http://localhost:${process.env.PORT || 8080}`);
        });
    } catch (error) {
        console.error("Database connection failed", error);
    }
})();
