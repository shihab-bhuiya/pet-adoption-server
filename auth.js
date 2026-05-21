const { betterAuth } = require("better-auth");
const { MongoClient } = require("mongodb");

// Create a dedicated database connection instance for Better Auth to use
const client = new MongoClient(process.env.MONGO_URI);

const auth = betterAuth({
    database: {
        db: client.db("pet-adoption"), // Ensure this matches your actual database name in MongoDB Atlas
        type: "mongodb"
    },
    emailAndPassword: {
        enabled: true // Allows your login and register forms to use standard email credentials
    },
    // Better Auth requires a secure secret key to sign session cookies. 
    // This string must be saved inside your backend hidden .env file!
    secret: process.env.BETTER_AUTH_SECRET 
});

module.exports = { auth };