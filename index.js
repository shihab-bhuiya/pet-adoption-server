const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { auth } = require("./auth");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: ["http://localhost:3000", "https://pet-adoption-platform-8c1l.vercel.app"],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Auth Route Sync Handler
app.all(/^\/api\/auth\/.*/, async (req, res) => {
  try {
    const response = await auth.handler(req);
    res.status(response.status).send(response.body);
  } catch (error) {
    console.error("Better Auth engine error:", error);
    res.status(500).send({ message: "Internal auth engine failure" });
  }
});

// Guard Middleware
const requireAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return res.status(401).send({ message: "Unauthorized: Session Context Required" });
    }
    req.user = session.user;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized token parse verification" });
  }
};

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
  try {
    await client.connect();
    console.log("Successfully established secure pool connection to MongoDB Cloud.");

    const database = client.db("pet-adoption");
    const petsCollection = database.collection("pets");
    const adoptionCollection = database.collection("adoptionRequests");

    // JWT Token Issuance Hook
    app.post('/api/jwt', async (req, res) => {
      try {
        const { email } = req.body;
        const token = jwt.sign({ email }, process.env.BETTER_AUTH_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, {
          httpOnly: true,
          secure: true,
          sameSite: 'none'
        }).send({ success: true });
      } catch (err) {
        res.status(500).send({ message: "JWT allocation error" });
      }
    });

    // 1. GET /api/pets (FIXED: Fallback query if status field doesn't exist yet)
    app.get('/api/pets', async (req, res) => {
      try {
        const { search, species } = req.query;
        
        // Match both explicit available pets AND legacy items without a status field
        let query = { 
          adoptionStatus: { $ne: "adopted" } 
        };
        
        if (search) {
          query.petName = { $regex: search, $options: 'i' };
        }
        if (species && species !== "") {
          query.species = { $in: species.split(',') };
        }

        const result = await petsCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: "Error processing catalog array query" });
      }
    });

    // 2. GET /api/pets/:id (Public Detailed Spec View)
    app.get('/api/pets/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid Object ID structure" });
        
        const result = await petsCollection.findOne({ _id: new ObjectId(id) });
        if (!result) return res.status(404).send({ message: "No database entry matches this identifier" });
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error querying detailed collection logs" });
      }
    });

    // 3. POST /api/pets (Private Shelter Submission Link)
    app.post('/api/pets', requireAuth, async (req, res) => {
      try {
        const { petName, species, breed, age, gender, petImage, healthStatus, vaccinationStatus, location, adoptionFee, description } = req.body;
        
        const newPet = {
          petName, species, breed, age, gender,
          petImage, healthStatus, vaccinationStatus,
          location, adoptionFee: parseFloat(adoptionFee) || 0,
          description, adoptionStatus: "available",
          ownerEmail: req.user.email, createdAt: new Date()
        };

        const result = await petsCollection.insertOne(newPet);
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ message: "Database write runtime execution error" });
      }
    });

    // 4. PUT /api/pets/:id (Private Owner Update Pipeline)
    app.put('/api/pets/:id', requireAuth, async (req, res) => {
      try {
        const id = req.params.id;
        const pet = await petsCollection.findOne({ _id: new ObjectId(id) });
        if (!pet) return res.status(404).send({ message: "Listing context file missing" });
        if (pet.ownerEmail !== req.user.email) return res.status(403).send({ message: "Forbidden update permissions" });

        const { petName, species, breed, age, gender, petImage, healthStatus, vaccinationStatus, location, adoptionFee, description } = req.body;
        const updatedDoc = {
          $set: {
            petName, species, breed, age, gender, petImage,
            healthStatus, vaccinationStatus, location, adoptionFee: parseFloat(adoptionFee) || 0, description
          }
        };

        await petsCollection.updateOne({ _id: new ObjectId(id) }, updatedDoc);
        res.status(200).send({ success: true });
      } catch (error) {
        res.status(500).send({ message: "Failed document update pipeline runtime execution" });
      }
    });

    // 5. DELETE /api/pets/:id (Private Owner Absolute Deletion Link)
    app.delete('/api/pets/:id', requireAuth, async (req, res) => {
      try {
        const id = req.params.id;
        const pet = await petsCollection.findOne({ _id: new ObjectId(id) });
        if (!pet) return res.status(404).send({ message: "Target profile missing from records" });
        if (pet.ownerEmail !== req.user.email) return res.status(403).send({ message: "Forbidden permission structure" });

        await petsCollection.deleteOne({ _id: new ObjectId(id) });
        await adoptionCollection.deleteMany({ petId: id }); 
        res.status(200).send({ success: true });
      } catch (error) {
        res.status(500).send({ message: "Failure during core records drop workflow execution" });
      }
    });

    // 6. POST /api/adoption-requests (Private Client Adoption Workflow)
    app.post('/api/adoption-requests', requireAuth, async (req, res) => {
      try {
        const { petId, pickupDate, message } = req.body;
        
        const pet = await petsCollection.findOne({ _id: new ObjectId(petId) });
        if (!pet) return res.status(404).send({ message: "Target pet target record entry missing" });
        if (pet.ownerEmail === req.user.email) return res.status(400).send({ message: "Adoption Control Rule: Owners cannot request their own animals." });
        if (pet.adoptionStatus === "adopted") return res.status(400).send({ message: "This animal companion has already been adopted into another household." });

        const existing = await adoptionCollection.findOne({ petId, userEmail: req.user.email });
        if (existing) return res.status(409).send({ message: "An application processing request for this animal is already active." });

        const application = {
          petId,
          petName: pet.petName,
          petImage: pet.petImage,
          userEmail: req.user.email,
          userName: req.user.name,
          pickupDate,
          message,
          status: "pending",
          requestDate: new Date()
        };

        const result = await adoptionCollection.insertOne(application);
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ message: "Server error logging adoption contract request profile" });
      }
    });

    // 7. GET /api/my-adoption-requests (Private Applicant Dashboard List)
    app.get('/api/my-adoption-requests', requireAuth, async (req, res) => {
      try {
        const result = await adoptionCollection.find({ userEmail: req.user.email }).sort({ requestDate: -1 }).toArray();
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: "Error parsing personal log history sheets" });
      }
    });

    // 8. DELETE /api/adoption-requests/:id (Private Client Request Cancellation Hook)
    app.delete('/api/adoption-requests/:id', requireAuth, async (req, res) => {
      try {
        const id = req.params.id;
        const request = await adoptionCollection.findOne({ _id: new ObjectId(id) });
        if (!request) return res.status(404).send({ message: "Target application item missing" });
        if (request.userEmail !== req.user.email) return res.status(403).send({ message: "Unauthorized tracking access configuration" });

        await adoptionCollection.deleteOne({ _id: new ObjectId(id) });
        res.status(200).send({ success: true });
      } catch (error) {
        res.status(500).send({ message: "Failed logging core cancel sequence operation" });
      }
    });

    // 9. GET /api/my-listings (Private Shelter Management Engine)
    app.get('/api/my-listings', requireAuth, async (req, res) => {
      try {
        const listings = await petsCollection.find({ ownerEmail: req.user.email }).toArray();
        const totalListings = listings.length;
        const available = listings.filter(p => p.adoptionStatus !== "adopted").length;
        const adopted = listings.filter(p => p.adoptionStatus === "adopted").length;

        res.status(200).send({ stats: { totalListings, available, adopted }, listings });
      } catch (error) {
        res.status(500).send({ message: "Failed parsing dashboard inventory maps" });
      }
    });

    // 10. GET /api/shelter-requests/:petId (Private Access to Pet Incoming Requests)
    app.get('/api/shelter-requests/:petId', requireAuth, async (req, res) => {
      try {
        const pet = await petsCollection.findOne({ _id: new ObjectId(req.params.petId) });
        if (!pet || pet.ownerEmail !== req.user.email) return res.status(403).send({ message: "Access forbidden to requested logs" });

        const requests = await adoptionCollection.find({ petId: req.params.petId }).toArray();
        res.status(200).send(requests);
      } catch (error) {
        res.status(500).send({ message: "Error compiling structural application records list" });
      }
    });

    // 11. PATCH /api/adoption-requests/:id/status (Private Status Application Management Core)
    app.patch('/api/adoption-requests/:id/status', requireAuth, async (req, res) => {
      try {
        const { status } = req.body; 
        const id = req.params.id;

        const request = await adoptionCollection.findOne({ _id: new ObjectId(id) });
        if (!request) return res.status(404).send({ message: "Target document entry missing" });

        const pet = await petsCollection.findOne({ _id: new ObjectId(request.petId) });
        if (!pet || pet.ownerEmail !== req.user.email) return res.status(403).send({ message: "Unauthorized permissions setup" });

        if (status === "approved") {
          if (pet.adoptionStatus === "adopted") {
            return res.status(400).send({ message: "Adoption Control Rule: This animal is already adopted by another applicant." });
          }
          await petsCollection.updateOne({ _id: new ObjectId(request.petId) }, { $set: { adoptionStatus: "adopted" } });
          await adoptionCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "approved" } });
          await adoptionCollection.updateMany({ petId: request.petId, _id: { $ne: new ObjectId(id) } }, { $set: { status: "rejected" } });
        } else {
          await adoptionCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "rejected" } });
        }

        res.status(200).send({ success: true });
      } catch (error) {
        res.status(500).send({ message: "Error writing document structural validation files" });
      }
    });

  } catch (error) {
    console.error("Initialization runtime panic state:", error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('MERN Secure Core Production Engine Deployment Live.'));
app.listen(port, () => console.log(`Server actively parsing pipelines on system thread port: ${port}`));