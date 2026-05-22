const { betterAuth } = require("better-auth");
require('dotenv').config();

if (!process.env.MONGO_URI) {
  throw new Error("Missing MONGO_URI inside environment variables");
}

const auth = betterAuth({
  database: {
    provider: "mongodb",
    mongodb: {
      url: process.env.MONGO_URI
    }
  },
  emailAndPassword: {
    enabled: true 
  },
  secret: process.env.BETTER_AUTH_SECRET
});

module.exports = { auth };