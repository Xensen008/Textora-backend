const mongoose = require("mongoose");

async function connectDB() {
    const connectWithRetry = async () => {
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                serverSelectionTimeoutMS: 10000, // Increase timeout to 10 seconds
            });
            const connection = mongoose.connection;

            connection.on('connected', () => {
                console.log("Connected to DB");
            });

            connection.on("error", (error) => {
                console.log("Error connecting to DB", error);
            });
        } catch (error) {
            console.error("MongoDB connection error:", error);
            setTimeout(connectWithRetry, 5000); 
        }
    };

    connectWithRetry();
}

module.exports = connectDB;
