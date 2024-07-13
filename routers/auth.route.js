const express = require("express")
const registerUser = require("../controller/register.auth")
const checkEmail = require("../controller/checkEmail")
const checkPassword = require("../controller/checkPassword")
const userData = require("../controller/userData")
const logout = require("../controller/logout")
const updateUser = require("../controller/updateUser")
const router = express.Router()
//create user api
router.post("/register",registerUser)
//checkuser email
router.post("/email",checkEmail)
//checking password and enter
router.post("/password",checkPassword)
//login user
router.get("/user-data",userData)
//logout users
router.get("/logout",logout)
//update user
router.post("/update",updateUser)

module.exports = router