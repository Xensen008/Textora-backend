const { ConvoModel } = require("../models/convo.model");
const UserModel = require("../models/user.model");

const getConversation = async (currentUserId) => {
    if (currentUserId) {
        try {
            console.log("Fetching conversations for user:", currentUserId);
            
            // Get current user with blocked users
            const currentUser = await UserModel.findById(currentUserId).select('blockedUsers');
            const blockedUserIds = currentUser?.blockedUsers?.map(id => id.toString()) || [];
            console.log("Blocked users:", blockedUserIds);

            // Get all conversations with populated fields
            const currentUserConversation = await ConvoModel.find({
                "$or": [
                    { sender: currentUserId },
                    { receiver: currentUserId }
                ]
            })
            .sort({ lastMessageAt: -1 })
            .populate({
                path: 'messages',
                options: { sort: { 'createdAt': -1 } }
            })
            .populate('sender')
            .populate('receiver')
            .populate({
                path: 'lastMsg',
                select: 'text imageUrl videoUrl createdAt msgByUserId'
            });

            console.log("Found raw conversations:", currentUserConversation.length);

            // Filter and format conversations
            const conversation = currentUserConversation
                .filter(conv => {
                    // Skip conversations with missing users
                    if (!conv.sender || !conv.receiver) return false;

                    // Determine the other user in the conversation
                    const otherUserId = conv.sender._id.toString() === currentUserId 
                        ? conv.receiver._id.toString() 
                        : conv.sender._id.toString();
                    
                    // Skip conversations with blocked users
                    return !blockedUserIds.includes(otherUserId);
                })
                .map((conv) => {
                    // Determine the other user in the conversation
                    const otherUserId = conv.sender._id.toString() === currentUserId 
                        ? conv.receiver._id.toString() 
                        : conv.sender._id.toString();

                    // Count unseen messages
                    const countUnseenMsg = conv.messages.reduce((prev, curr) => {   
                        if (!curr || !curr.msgByUserId) return prev;
                        
                        const msgByUserId = curr.msgByUserId.toString();
                        if (msgByUserId !== currentUserId && !curr.seen) {
                            return prev + 1;
                        }
                        return prev;
                    }, 0);

                    // Get the last message
                    const lastMessage = conv.messages[0] || conv.lastMsg;

                    return {
                        _id: conv._id,
                        sender: conv.sender,
                        receiver: conv.receiver,
                        unseenMsg: countUnseenMsg,
                        lastMsg: lastMessage,
                        lastMessageAt: lastMessage?.createdAt || conv.lastMessageAt || conv.updatedAt
                    };
                });

            console.log("Returning processed conversations:", conversation.length);
            return conversation;
        } catch (error) {
            console.error('Error in getConversation:', error);
            return [];
        }
    }
    return [];
}

module.exports = getConversation;