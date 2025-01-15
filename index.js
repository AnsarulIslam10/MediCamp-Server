require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const jwt = require("jsonwebtoken");
const cors = require("cors");
const port = process.env.PORT | 5000;

//middleware
const corsOptions = {
  origin: ["http://localhost:5173"],
  credentials: true,
  optionalSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8ggzn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verifyToken
const verifyToken = (req, res, next) => {
  console.log("inside verify token", req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const campCollection = client.db("mediCampDB").collection("camps");
    const userCollection = client.db("mediCampDB").collection("users");

    // jwt token
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    //camps related apis
    app.get("/all-camps", async (req, res) => {
      const search = req.query.search;
      const sortBy = req.query.sortBy;
      let query = {
        campName: {
          $regex: search,
          $options: "i",
        },
      };

      let sort = {};
      if (sortBy === "most-registered") {
        sort = { participantCount: -1 };
      } else if (sortBy === "camp-fees") {
        sort = { campFees: 1 };
      } else if (sortBy === "alphabetical") {
        sort = { campName: 1 };
      }

      const result = await campCollection.find(query).sort(sort).toArray();
      res.send(result);
    });

    app.get("/camp/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.findOne(query);
      res.send(result);
    });

    app.get("/popular-camps", async (req, res) => {
      const result = await campCollection
        .find()
        .sort({ participantCount: 1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.post("/add-camp", async (req, res) => {
      const newPost = req.body;
      const result = await campCollection.insertOne(newPost);
      res.send(result);
    });

    app.get('/camps/organizer/:email', async(req, res)=>{
      const email = req.params.email;
      const query = {email: email}
      const result = await campCollection.find(query).toArray()
      res.send(result)
    })
    
    // users related api
    app.post("/users", async (req, res) => {
      const user = req.body;
      // insert email if user doesn't exists
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
