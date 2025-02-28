const { Server } = require("socket.io");

let io = null;

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`🟢 New client connected: ${socket.id}`);

    socket.on("message", (data) => {
      console.log(`Message from ${socket.id}:`, data);
      socket.broadcast.emit("message", data);
    });

    socket.on("disconnect", () => {
      console.log(`🔴 Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

// Add this function to safely get io instance
function getIO() {
  if (!io) {
    throw new Error("Socket.IO is not initialized! Call initializeSocket() first.");
  }
  return io;
}

module.exports = { initializeSocket, getIO };
