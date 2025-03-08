const Redis = require("ioredis");
require("dotenv").config(); // Load environment variables

const redis = new Redis(process.env.REDIS_URL);

redis.on("connect", () => {
  console.log("Connected to Upstash Redis");
});

redis.on("error", (err) => {
  console.error("Upstash Redis connection error:", err);
});

module.exports = redis;