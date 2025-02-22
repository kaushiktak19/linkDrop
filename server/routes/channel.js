// server/routes/channel.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const redis = require('../config/redis');

/**
 * @route POST /api/channel/create
 * @desc Create a new channel
 */
router.post('/create', async (req, res) => {
    try {
        const { password } = req.body;
        const channelId = uuidv4();
        
        const newChannel = {
            id: channelId,
            password,
            members: 1,
            isActive: true,
            creator: true,
        };

        await redis.hset(`channel:${channelId}`, newChannel);
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

        if (!channel || channel.password !== password) {
            return res.status(401).json({ error: "Invalid Channel ID or Password" });
        }

        if (parseInt(channel.members) >= 2) {
            return res.status(401).json({ error: "Channel is full" });
        }

        await redis.hincrby(`channel:${channelId}`, "members", 1);
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

        if (!channel || channel.isActive === 'false') {
            return res.status(404).json({ error: 'Channel not found' });
        }

        res.json({
            id: channel.id,
            members: parseInt(channel.members),
            isCreator: channel.creator === 'true',
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
        const { channelId } = req.body;
        const channel = await redis.hgetall(`channel:${channelId}`);

        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        if (channel.creator !== 'true') {
            return res.status(403).json({ error: 'Only the creator can terminate the channel' });
        }

        await redis.del(`channel:${channelId}`);
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

        const updatedMembers = parseInt(channel.members) - 1;
        await redis.hset(`channel:${channelId}`, "members", updatedMembers);

        if (updatedMembers <= 0) {
            await redis.hset(`channel:${channelId}`, "isActive", false);
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error leaving channel:", error);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
