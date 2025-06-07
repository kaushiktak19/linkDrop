const Redis = require("ioredis");
require("dotenv").config();

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  tls: {},
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