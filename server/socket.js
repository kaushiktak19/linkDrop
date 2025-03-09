const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const redis = require("./config/redis");
const bcrypt = require("bcryptjs");

let io = null;

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: 'https://link-drop.vercel.app',
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log(`🟢 Client connected: ${socket.id}`);

    // Create a new channel
    socket.on("createChannel", async ({ password, userId }, callback) => {
      try {
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
        socket.join(channelId);

        callback({ success: true, channelId });
      } catch (error) {
        console.error("Error creating channel:", error);
        callback({ success: false, error: "Server error" });
      }
    });

    // Join an existing channel
    socket.on("joinChannel", async ({ channelId, password }, callback) => {
      try {
        const channel = await redis.hgetall(`channel:${channelId}`);
        if (!channel || channel.isActive === "false") {
          return callback({ success: false, error: "Channel not found" });
        }

        const isMatch = await bcrypt.compare(password, channel.password);
        if (!isMatch) return callback({ success: false, error: "Invalid password" });

        let members = parseInt(channel.members);
        if (members >= 2) {
          return callback({ success: false, error: "Channel is full" });
        }

        members += 1;
        await redis.hset(`channel:${channelId}`, "members", members.toString());
        socket.join(channelId);

        io.to(channelId).emit("channelUpdated", { channelId, members });
        callback({ success: true });
      } catch (error) {
        console.error("Error joining channel:", error);
        callback({ success: false, error: "Server error" });
      }
    });

    // Fetch channel details
    socket.on("getChannel", async ({ channelId }, callback) => {
      try {
        const channel = await redis.hgetall(`channel:${channelId}`);
        if (!channel || channel.isActive === "false") {
          return callback({ success: false, error: "Channel not found" });
        }

        callback({
          success: true,
          id: channel.id,
          members: parseInt(channel.members),
          creator: channel.creator,
        });
      } catch (error) {
        console.error("Error getting channel:", error);
        callback({ success: false, error: "Server error" });
      }
    });

    // Leave a channel
    socket.on("leaveChannel", async ({ channelId }) => {
      try {
        const channel = await redis.hgetall(`channel:${channelId}`);
        if (!channel) return;

        let updatedMembers = parseInt(channel.members) - 1;
        if (updatedMembers <= 0) {
          await redis.hset(`channel:${channelId}`, "isActive", "false");
        } else {
          await redis.hset(`channel:${channelId}`, "members", updatedMembers.toString());
        }

        socket.leave(channelId);
        io.to(channelId).emit("userLeft", { channelId, members: updatedMembers });
      } catch (error) {
        console.error("Error leaving channel:", error);
      }
    });

    // Terminate a channel
    socket.on("terminateChannel", async ({ channelId }) => {
      try {
        await redis.del(`channel:${channelId}`);
        io.to(channelId).emit("channelDeleted", { channelId });
      } catch (error) {
        console.error("Error terminating channel:", error);
      }
    });

    // --- WebRTC Signaling Events ---

    socket.on("send-offer", ({ channelId, offer }) => {
      socket.to(channelId).emit("receive-offer", { offer, senderId: socket.id });
      console.log(`📤 Offer sent to channel ${channelId} from ${socket.id}`);
    });

    socket.on("send-answer", ({ channelId, answer, receiverId }) => {
      io.to(receiverId).emit("receive-answer", { answer, senderId: socket.id });
      console.log(`📥 Answer sent to ${receiverId} from ${socket.id}`);
    });

    socket.on("send-ice-candidate", ({ channelId, candidate, receiverId }) => {
      if (receiverId) {
        io.to(receiverId).emit("receive-ice-candidate", { candidate, senderId: socket.id });
      } else {
        socket.to(channelId).emit("receive-ice-candidate", { candidate, senderId: socket.id });
      }
      console.log(`❄️ ICE candidate sent from ${socket.id} to ${receiverId || channelId}`);
    });

    socket.on("disconnect", () => {
      console.log(`🔴 Client disconnected: ${socket.id}`);      const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
      rooms.forEach(channelId => {
        io.to(channelId).emit("peer-disconnected", { peerId: socket.id });
      });
    });

    // --- End WebRTC Signaling Events ---
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error("Socket.IO is not initialized! Call initializeSocket() first.");
  }
  return io;
}

module.exports = { initializeSocket, getIO };