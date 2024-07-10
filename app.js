express = require("express")
path= require("path")
app = express()


port= 8080

app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())


app.get("/", (req, res) => {
    res.send("hey fuckers")
})

app.get("/chat", (req, res) => {
    res.send("Chat Page")
})

app.listen(port, () => {
    console.log(`Server running at https://localhost:${port})`)
}
)


