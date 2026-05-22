const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const { auth } = require("./auth");

const app = express();
const port = process.env.PORT || 5000;

// -------------------- CORE MIDDLEWARE --------------------
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://pet-adoption-platform-8c1l.vercel.app",
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// -------------------- BETTER-AUTH (FIXED) --------------------
// ❌ DO NOT wrap auth.handler manually
// ✔ Correct way:
app.use("/api/auth", auth.handler);

// -------------------- MONGO DB --------------------
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    deprecationErrors: true,
  },
});

// -------------------- AUTH GUARD --------------------
const requireAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = session.user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid session" });
  }
};

// -------------------- DATABASE ROUTES --------------------
async function run() {
  try {
    await client.connect();
    console.log("MongoDB connected");

    const db = client.db("pet-adoption");
    const petsCollection = db.collection("pets");
    const adoptionCollection = db.collection("adoptionRequests");

    // -------------------- PETS --------------------
    app.get("/api/pets", async (req, res) => {
      const data = await petsCollection.find({}).toArray();
      res.send(data);
    });

    app.get("/api/pets/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid ID" });
      }

      const pet = await petsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.send(pet);
    });

    app.post("/api/pets", requireAuth, async (req, res) => {
      const pet = {
        ...req.body,
        ownerEmail: req.user.email,
        adoptionStatus: "available",
        createdAt: new Date(),
      };

      const result = await petsCollection.insertOne(pet);

      res.send(result);
    });

    // -------------------- ADOPTION --------------------
    app.post("/api/adoption-requests", requireAuth, async (req, res) => {
      const { petId, message, pickupDate } = req.body;

      const pet = await petsCollection.findOne({
        _id: new ObjectId(petId),
      });

      if (!pet) return res.status(404).send({ message: "Pet not found" });

      const request = {
        petId,
        petName: pet.petName,
        userEmail: req.user.email,
        message,
        pickupDate,
        status: "pending",
        requestDate: new Date(),
      };

      const result = await adoptionCollection.insertOne(request);

      res.send(result);
    });

    app.get("/api/my-adoption-requests", requireAuth, async (req, res) => {
      const data = await adoptionCollection
        .find({ userEmail: req.user.email })
        .toArray();

      res.send(data);
    });
  } catch (err) {
    console.error(err);
  }
}

run();

app.get("/", (req, res) => {
  res.send("Server Running");
});

app.listen(port, () => {
  console.log("Server running on port", port);
});