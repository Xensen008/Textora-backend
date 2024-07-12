const express = require("express")
const registerUser = require("../controller/register.auth")
const checkEmail = require("../controller/chechEmail")
const router = express.Router()
//create user api
router.post("/register",registerUser)
//checkuser email
router.post("/email",checkEmail)
module.exports = router