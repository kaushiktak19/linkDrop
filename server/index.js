// // server/index.js
// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const channelRoutes = require('./routes/channel');

// const app = express();
// const PORT = process.env.PORT || 5000;

// // Middleware
// app.use(cors({
//     origin: 'http://localhost:5173',
// }));

// app.use(express.json());

// // Routes
// app.use('/api/channel', channelRoutes);

// // Health Check
// app.get('/', (req, res) => {
//     res.send('Server is running'); 
// });

// // Start Server
// app.listen(PORT, () => {
//     console.log(`Server running on http://localhost:${PORT}`);
// });

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const app = express();
const server = http.createServer(app);
const { initializeSocket } = require("./socket");
const io = initializeSocket(server) // Import socket initializer
const channelRoutes = require("./routes/channel");



// Middleware
app.use(cors());
app.use(express.json());

// Sample route to check if server is running
app.get("/", (req, res) => {
  res.send("Server is running...");
});

// Routes
app.use("/api/channel", channelRoutes);

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("🛑 Shutting down server...");
  io.close(() => {
    console.log("Socket.IO closed.");
    server.close(() => {
      console.log("HTTP server closed.");
      process.exit(0);
    });
  });
});
