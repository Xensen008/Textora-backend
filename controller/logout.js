async function logout(req,res){
    try {
        const cookieOption={
            http :true,
            secure:true,
        }
        res.setHeader("Set-Cookie",[
            `token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None`
        ])
        return res.status(200).json({
            messgae:"session out",
            success:true
        })
    } catch (error) {
        return res.status(500).json({
            message:error.message || error,
            error:true
        })
    }
}

module.exports = logout