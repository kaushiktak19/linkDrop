// server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const channelRoutes = require('./routes/channel');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/channel', channelRoutes);

// Health Check
app.get('/', (req, res) => {
    res.send('Server is running');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
