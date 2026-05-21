const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb'); 
require('dotenv').config();
const { auth } = require("./auth");

const app = express();
const port = process.env.PORT || 5000;

// ==========================================
// MIDDLEWARES (Configured for Auth Cookies)
// ==========================================
app.use(cors({
    origin: ["http://localhost:3000", "https://pet-adoption-platform.vercel.app"],
    credentials: true 
}));
app.use(express.json()); 

// FIXED: Native Regular Expression bypasses Express string parsing errors completely
app.all(/^\/api\/auth\/.*/, async (req, res) => {
  try {
    const response = await auth.handler(req);
    res.status(response.status).send(response.body);
  } catch (error) {
    console.error("Better Auth engine execution error:", error);
    res.status(500).send({ message: "Internal authentication handler error" });
  }
});

// ==========================================
// MONGODB DATABASE CONNECTION
// ==========================================
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

    // Set up database and collection references
    const database = client.db("pet-adoption"); 
    const petsCollection = database.collection("pets");
    const adoptionCollection = database.collection("adoptionRequests");

    // ==========================================
    // API ROUTES
    // ==========================================

    // 1. GET /api/pets - Fetch available pets with Search & Filters
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

    // 2. GET /api/pets/:id - Fetch single pet profile details safely
   // 2. GET /api/pets/:id - Fetch single pet profile details safely
    app.get('/api/pets/:id', async (req, res) => {
      try {
        const id = req.params.id;
        
        // 1. Double check validation BEFORE converting to ObjectId
        if (!id || id.length !== 24 || !ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid pet ID string format format" });
        }

        // 2. Wrap the database lookup query inside its own try-catch
        let result;
        try {
          const query = { _id: new ObjectId(id) };
          result = await petsCollection.findOne(query);
        } catch (dbError) {
          console.error("MongoDB engine lookup failure:", dbError);
          return res.status(404).send({ message: "Database could not parse ID string" });
        }

        // 3. If no matching pet is found, return 404 instead of throwing a 500 crash
        if (!result) {
          return res.status(404).send({ message: "No animal found matching this ID record" });
        }

        // 4. Normalize images safely
        const normalizedResult = {
          ...result,
          imageUrl: result.imageUrl || result.petImage,
          petImage: result.petImage || result.imageUrl
        };

        return res.status(200).send(normalizedResult);

      } catch (error) {
        console.error("Error finding pet profile details:", error);
        return res.status(500).send({ message: "Server error recovering pet profile details" });
      }
    });

    // 3. POST /api/adoption-requests - Save a new adoption form submission
    app.post('/api/adoption-requests', async (req, res) => {
      try {
        const application = req.body;
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

    // 4. GET /api/my-adoption-requests - Fetch applications belonging to logged-in user
    app.get('/api/my-adoption-requests', async (req, res) => {
      try {
        const userEmail = req.query.email;
        
        if (!userEmail) {
          return res.status(400).send({ message: "Email query parameter is required" });
        }
        
        const query = { userEmail: userEmail };
        const result = await adoptionCollection.find(query).toArray();
        
        res.status(200).send(result);
      } catch (error) {
        console.error("Error retrieving user adoption requests:", error);
        res.status(500).send({ message: "Server error recovering applications history" });
      }
    });

  } catch (error) {
    console.error("Database tracking sequence initialization failure:", error);
  }
}
run().catch(console.dir);

// Root heartbeat route
app.get('/', (req, res) => {
  res.send('Pet Adoption Platform server is running...');
});

// Start listening
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});