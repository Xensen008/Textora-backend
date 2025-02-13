const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true
    },
    imageUrl: {
        type: String,
        default: null
    },
    videoUrl: {
        type: String,
        default: null
    },
    msgByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'seen'],
        default: 'sent'
    },
    seen: {
        type: Boolean,
        default: false
    },
    deleted: {
        type: Boolean,
        default: false
    },
    sentAt: {
        type: Date,
        default: Date.now
    },
    deliveredAt: {
        type: Date,
        default: null
    },
    seenAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Add index for faster queries
messageSchema.index({ conversationId: 1, status: 1, deleted: 1 });
messageSchema.index({ msgByUserId: 1, status: 1 });
messageSchema.index({ status: 1, deliveredAt: 1 });
messageSchema.index({ status: 1, seenAt: 1 });

module.exports = mongoose.model('Message', messageSchema); 