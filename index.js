const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json()); // Allows Express to parse JSON bodies

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
    const database = client.db("pet-adoption"); // Use your actual DB name here
    const petsCollection = database.collection("pets");

    // ==========================================
    // API ROUTES
    // ==========================================

    // 1. GET /api/pets - Fetch all available pets (Public Route)
    // 1. GET /api/pets - Fetch available pets with Advanced Search & Filters
    app.get('/api/pets', async (req, res) => {
      try {
        const { search, species } = req.query;
        
        // Start with the base filter: only show available pets
        let query = { adoptionStatus: "available" };

        // Challenge Part A: Search pets by name ($regex)
        if (search) {
          query.petName = { $regex: search, $options: 'i' }; // 'i' makes it case-insensitive
        }

        // Challenge Part B: Filter pets by species ($in)
        if (species) {
          // If multiple species are passed from client as a comma-separated string (e.g. "Dog,Cat")
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
    app.get('/api/pets/:id', async (req, res) => {
      try {
        const id = req.params.id;
        
        // Ensure the ID format is a valid MongoDB ObjectId hex string
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
        
        // Access a new collection inside your database dynamically
        const adoptionCollection = database.collection("adoptionRequests");
        
        // Insert application document into your MongoDB cluster collection
        const result = await adoptionCollection.insertOne(application);
        
        res.status(201).send({ 
          message: "Application logged successfully", 
          insertedId: result.insertedId 
        });
      } catch (error) {
        console.error("Error logging adoption application:", error);
        res.status(500).send({ message: "Server error while saving application form" });
      }
    });

  } finally {
    // Keep connection open while app runs
  }
}
run().catch(console.dir);

// Root route to check if server works
app.get('/', (req, res) => {
  res.send('Pet Adoption Platform server is running running...');
});

// Start listening
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});