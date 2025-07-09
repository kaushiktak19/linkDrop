const Redis = require("ioredis");
require("dotenv").config();

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  connectTimeout: 10000,
});

redis.on("connect", () => {
  console.log("Connected to Upstash Redis");
});

redis.on("error", (err) => {
  console.error("Upstash Redis connection error:", err);
});

module.exports = redis;