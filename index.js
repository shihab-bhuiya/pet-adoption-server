const express = require('express');
const cors = require('cors');
// FIXED: Added ObjectId right here!
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb'); 
require('dotenv').config();
const { auth } = require("./auth");
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json()); // Allows Express to parse JSON bodies

app.all("/api/auth/*", async (req, res) => {
  // Better Auth handles the incoming request object natively
  const response = await auth.handler(req);
  res.status(response.status).send(response.body);
});

// MongoDB Connection
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect to the Atlas cluster
    await client.connect();
    console.log("Successfully connected to MongoDB!");

    // Set up your database and collection references
    const database = client.db("pet-adoption"); 
    const petsCollection = database.collection("pets");

    // ==========================================
    // API ROUTES
    // ==========================================

    // 1. GET /api/pets - Fetch available pets with Advanced Search & Filters
    app.get('/api/pets', async (req, res) => {
      try {
        const { search, species } = req.query;
        let query = { adoptionStatus: "available" };

        if (search) {
          query.petName = { $regex: search, $options: 'i' }; 
        }

        if (species) {
          const speciesArray = species.split(',');
          query.species = { $in: speciesArray };
        }

        const cursor = petsCollection.find(query);
        const result = await cursor.toArray();
        
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching filtered pets:", error);
        res.status(500).send({ message: "Server error while fetching pets" });
      }
    });

    // 2. GET /api/pets/:id - Fetch single pet details (FIXED & WORKING NOW)
    app.get('/api/pets/:id', async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid pet ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await petsCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Pet companion profile not found" });
        }

        res.status(200).send(result);
      } catch (error) {
        console.error("Error finding pet profile details:", error);
        res.status(500).send({ message: "Server error recovering pet profile details" });
      }
    });

    // 3. POST /api/adoption-requests - Save a new user adoption request application
    app.post('/api/adoption-requests', async (req, res) => {
      try {
        const application = req.body;
        const adoptionCollection = database.collection("adoptionRequests");
        const result = await adoptionCollection.insertOne(application);
        
        res.status(201).send({ 
          message: "Application logged successfully", 
          insertedId: result.insertedId 
        });
      } catch (error) {
        console.error("Error logging adoption application:", error);
        res.status(500).send({ message: "Server error while saving application form" });
      }

      // Add this route into your async function run() block inside backend index.js:

app.get('/api/my-adoption-requests', async (req, res) => {
  try {
    const userEmail = req.query.email;
    
    if (!userEmail) {
      return res.status(400).send({ message: "Email query parameter is required" });
    }

    const adoptionCollection = client.db("pet-adoption").collection("adoptionRequests");
    
    // Query filter: find items matching the applicant's email address
    const query = { userEmail: userEmail };
    const result = await adoptionCollection.find(query).toArray();
    
    res.status(200).send(result);
  } catch (error) {
    console.error("Error retrieving user adoption requests:", error);
    res.status(500).send({ message: "Server error recovering applications history" });
  }
});
    });

  } finally {
    // Keep connection open while app runs
  }
}
run().catch(console.dir);

// Root route to check if server works
app.get('/', (req, res) => {
  res.send('Pet Adoption Platform server is running...');
});

// Start listening
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});