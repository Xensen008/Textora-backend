const {ConvoModel}= require("../models/convo.model");
const getConversation = async(currentUserId)=>{
    if (currentUserId) {
        const currentUserConversation = await ConvoModel.find({
            "$or": [
                { sender: currentUserId },
                { receiver: currentUserId }
            ]
        }).sort({ updatedAt: -1 }).populate('messages').populate('sender').populate('receiver');


        const conversation = currentUserConversation.map((conv) => {
            const countUnseenMsg = conv.messages.reduce((prev, curr) => {   
                const msgByUserId = curr?.msgByUserId.toString();
                if(msgByUserId !== currentUserId && !curr.seen){
                    return prev + 1;
                }else{
                    return prev;
                }
            }, 0);

            return {
                _id: conv._id,
                sender: conv.sender,
                receiver: conv.receiver,
                unseenMsg: countUnseenMsg,
                lastMsg: conv.messages[conv.messages.length - 1]
            };
        });

        return conversation;
    }
}

module.exports = getConversation