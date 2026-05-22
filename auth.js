import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb"; // <-- Built-in subpath import!
import { MongoClient } from "mongodb";

// Initialize your MongoDB client connection
const client = new MongoClient(process.env.MONGO_URI || process.env.MONGODB_URI);
const db = client.db(); // Connects to the database specified in your connection string

export const auth = betterAuth({
    // Pass the built-in mongodbAdapter function into the database configuration
    database: mongodbAdapter(db),
    
    emailAndPassword: {
        enabled: true
    },
    trustedOrigins: [
        "http://localhost:3000",
        "https://pet-adoption-platform-8c1l.vercel.app"
    ]
});