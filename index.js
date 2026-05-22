const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const { auth } = require("./auth");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: ["http://localhost:3000", "https://pet-adoption-platform-8c1l.vercel.app"],
  credentials: true
}));
app.use(express.json());

// Auth Route Handler
app.all(/^\/api\/auth\/.*/, async (req, res) => {
  try {
    const response = await auth.handler(req);
    res.status(response.status).send(response.body);
  } catch (error) {
    console.error("Better Auth engine execution error:", error);
    res.status(500).send({ message: "Internal authentication handler error" });
  }
});

// Authentication Middleware Guard
const requireAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return res.status(401).send({ message: "Unauthorized: session required" });
    }
    req.user = session.user;
    next();
  } catch (error) {
    console.error("Session verification error:", error);
    return res.status(401).send({ message: "Unauthorized: session failed" });
  }
};

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB!");

    const database = client.db("pet-adoption");
    const petsCollection = database.collection("pets");
    const adoptionCollection = database.collection("adoptionRequests");

    // 1. GET /api/pets - Fetch & Filter Pets
    app.get('/api/pets', async (req, res) => {
      try {
        const { search, species } = req.query;
        let query = { adoptionStatus: "available" };
        if (search) query.petName = { $regex: search, $options: 'i' };
        if (species) query.species = { $in: species.split(',') };

        const result = await petsCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching pets" });
      }
    });

    // 2. GET /api/pets/:id - Fetch Single Pet
    app.get('/api/pets/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID format" });
        
        const result = await petsCollection.findOne({ _id: new ObjectId(id) });
        if (!result) return res.status(404).send({ message: "Pet not found" });

        const normalized = { ...result, imageUrl: result.imageUrl || result.petImage, petImage: result.petImage || result.imageUrl };
        res.status(200).send(normalized);
      } catch (error) {
        res.status(500).send({ message: "Server error recovering pet profile" });
      }
    });

    // 3. POST /api/pets - Add a Pet (Protected)
    app.post('/api/pets', requireAuth, async (req, res) => {
      try {
        const { petName, species, breed, age, petImage, description } = req.body;
        const newPet = {
          petName, species, breed, age, 
          imageUrl: petImage, petImage, 
          description, adoptionStatus: "available",
          postedBy: req.user.email, createdAt: new Date()
        };
        const result = await petsCollection.insertOne(newPet);
        res.status(201).send({ message: "Pet added successfully", insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ message: "Failed to add pet entry" });
      }
    });

    // 4. POST /api/adoption-requests - Create Application (Protected)
    app.post('/api/adoption-requests', requireAuth, async (req, res) => {
      try {
        const { petId, petName, petImage, userPhone, userAddress } = req.body;
        const userEmail = req.user.email;

        const existing = await adoptionCollection.findOne({ petId, userEmail });
        if (existing) return res.status(409).send({ message: "Application already submitted for this pet" });

        const application = {
          petId, petName, petImage, userEmail, userName: req.user.name,
          userPhone, userAddress, status: 'pending', submittedAt: new Date()
        };

        const result = await adoptionCollection.insertOne(application);
        res.status(201).send({ message: "Application submitted", insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ message: "Server error saving application" });
      }
    });

    // 5. GET /api/my-adoption-requests - User's Applications (Protected)
    app.get('/api/my-adoption-requests', requireAuth, async (req, res) => {
      try {
        const result = await adoptionCollection.find({ userEmail: req.user.email }).sort({ submittedAt: -1 }).toArray();
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: "Error recovering application history" });
      }
    });

  } catch (error) {
    console.error("Initialization failure:", error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Pet Adoption Platform server running...'));
app.listen(port, () => console.log(`Server listening on port ${port}`));