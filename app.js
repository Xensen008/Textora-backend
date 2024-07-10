const express = require("express")
const path= require("path")
const app = express()
const cors = require("cors")
const connectDB = require("./config/connectDB")


require('dotenv').config()

app.use(cors({
    origin : process.env.FRONTEND_URL,
    Credential:true
}))
 
const PORT = process.env.port || 8080

app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())


app.get("/", (req, res) => {
    res.send("hey fuckers")
})

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}).catch((error) => {
    console.log("error", error);
});




