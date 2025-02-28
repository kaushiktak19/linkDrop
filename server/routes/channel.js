const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const redis = require('../config/redis');
const { getIO } = require("../socket");
const bcrypt = require("bcryptjs");

const io = getIO();

/**
 * @route POST /api/channel/create
 * @desc Create a new channel
 */
router.post('/create', async (req, res) => {
    try {
        const { password, userId } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const channelId = uuidv4();

        const newChannel = {
            id: channelId,
            password: hashedPassword,
            members: "1",  
            isActive: "true",
            creator: userId,
        };

        await redis.hmset(`channel:${channelId}`, newChannel);

        res.json({ channelId });
    } catch (error) {
        console.error("Error creating channel:", error);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * @route POST /api/channel/join
 * @desc Join an existing channel
 */
router.post('/join', async (req, res) => {
    try {
        const { channelId, password } = req.body;
        const channel = await redis.hgetall(`channel:${channelId}`);
        const isMatch = await bcrypt.compare(password, channel.password);
        
        if (!isMatch) return res.status(401).json({ error: "Invalid password" });

        if (!channel || channel.isActive === "false") {
            return res.status(404).json({ error: "Channel not found or inactive" });
        }

        let members = parseInt(channel.members);
        if (members >= 2) {
            return res.status(403).json({ error: "Channel is full" });
        }

        members += 1;
        await redis.hset(`channel:${channelId}`, "members", members.toString());

        // Notify others about the new member
        io.emit("channelUpdated", { channelId, members });

        res.json({ success: true });
    } catch (error) {
        console.error("Error joining channel:", error);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * @route GET /api/channel/:id
 * @desc Get channel details
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const channel = await redis.hgetall(`channel:${id}`);

        if (!channel || channel.isActive === "false") {
            return res.status(404).json({ error: 'Channel not found' });
        }

        res.json({
            id: channel.id,
            members: parseInt(channel.members),
            creator: channel.creator,
        });
    } catch (error) {
        console.error("Error getting channel:", error);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * @route POST /api/channel/terminate
 * @desc Terminate a channel
 */
router.post('/terminate', async (req, res) => {
    try {
        const { channelId, userId } = req.body;
        const channel = await redis.hgetall(`channel:${channelId}`);

        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }
        
        // if (channel.creator !== userId) {
        //     return res.status(403).json({ error: "Only the creator can terminate the channel" });
        // }

        await redis.del(`channel:${channelId}`);

        // Emit termination event
        io.emit("channelDeleted", { channelId });

        res.json({ success: true });
    } catch (error) {
        console.error("Error terminating channel:", error);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * @route POST /api/channel/leave
 * @desc Leave a channel
 */
router.post('/leave', async (req, res) => {
    try {
        const { channelId } = req.body;
        const channel = await redis.hgetall(`channel:${channelId}`);

        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        let updatedMembers = parseInt(channel.members) - 1;
        if (updatedMembers <= 0) {
            await redis.hset(`channel:${channelId}`, "isActive", "false");
        } else {
            await redis.hset(`channel:${channelId}`, "members", updatedMembers.toString());
        }

        // Notify others
        io.emit("userLeft", { channelId, members: updatedMembers });

        res.json({ success: true });
    } catch (error) {
        console.error("Error leaving channel:", error);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
