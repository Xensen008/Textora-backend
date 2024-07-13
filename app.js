const express = require("express")
const app = express()
const cors = require("cors")
const connectDB = require("./config/connectDB")
const router = require("./routers/auth.route")
const cookiesParser = require("cookie-parser")
require('dotenv').config()



app.use(cors({
    origin : process.env.FRONTEND_URL,
    Credential:true
}))
 
const PORT = process.env.port || 8080

app.use(express.json())
app.use(cookiesParser())


app.get("/", (req, res) => {
    res.send("hey fuckers")

})

//api endpoints 
app.use("/api",router)

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}).catch((error) => {
    console.log("error", error);
});




