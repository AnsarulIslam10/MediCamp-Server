require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const campCollection = client.db("mediCampDB").collection("camps");
    const userCollection = client.db("mediCampDB").collection("users");
    const registeredCampCollection = client
      .db("mediCampDB")
      .collection("registeredCamps");
    const paymentCollection = client.db("mediCampDB").collection("payments");
    const feedbackCollection = client.db("mediCampDB").collection("feedbacks");

    // jwt token
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res.send({ token });
    });

    // verifyToken
    const verifyToken = (req, res, next) => {
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

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    //camps related apis
    app.get("/all-camps", async (req, res) => {
      const search = req.query.search || "";
      const sortBy = req.query.sortBy;
      const { page = 1, limit = 9 } = req.query;
      let query = {
        $or: [
          { campName: { $regex: search, $options: "i" } },
          { healthcareProfessionalName: { $regex: search, $options: "i" } },
          { dateTime: { $regex: search, $options: "i" } },
          { location: { $regex: search, $options: "i" } },
        ],
      };

      let sort = {};
      if (sortBy === "most-registered") {
        sort = { participantCount: -1 };
      } else if (sortBy === "camp-fees") {
        sort = { campFees: 1 };
      } else if (sortBy === "alphabetical") {
        sort = { campName: 1 };
      }
      const pageNumber = parseInt(page);
      const limitNumber = parseInt(limit);
      const totalCount = await campCollection.countDocuments(query);

      const result = await campCollection
        .find(query)
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .sort(sort)
        .toArray();
      res.send({
        result,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNumber),
        currentPage: pageNumber,
      });
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
        .sort({ participantCount: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.post("/add-camp", async (req, res) => {
      const newPost = req.body;
      const result = await campCollection.insertOne(newPost);
      res.send(result);
    });

    app.get(
      "/camps/organizer/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const search = req.query.search || "";
        const { page = 1, limit = 10 } = req.query;
        const query = { email: email };
        let searchQuery = {
          $or: [
            { campName: { $regex: search, $options: "i" } },
            { healthcareProfessionalName: { $regex: search, $options: "i" } },
            { dateTime: { $regex: search, $options: "i" } },
          ],
        };

        const finalQuery = { ...query, ...searchQuery };
        const pageNumber = parseInt(page);
        const limitNumber = parseInt(limit);
        const totalCount = await campCollection.countDocuments(query);
        const result = await campCollection
          .find(finalQuery)
          .skip((pageNumber - 1) * limitNumber)
          .limit(limitNumber)
          .toArray();
        res.send({
          result,
          totalCount,
          totalPages: Math.ceil(totalCount / limitNumber),
          currentPage: pageNumber,
        });
      }
    );

    app.patch("/update-camp/:campId", verifyToken, async (req, res) => {
      const data = req.body;
      const id = req.params.campId;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          campName: data.campName,
          campFees: data.campFees,
          dateTime: data.dateTime,
          participantCount: data.participantCount,
          healthcareProfessionalName: data.healthcareProfessionalName,
          location: data.location,
          description: data.description,
          image: data.image,
        },
      };
      const result = await campCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/camp/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.deleteOne(query);
      res.send(result);
    });

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

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.patch("/update-user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const { name, photoURL, phoneNumber, address } = req.body;
      const filter = { email: email };
      const updateDoc = {
        $set: {
          name,
          photoURL,
          phoneNumber,
          address,
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // join camp/ registered camp related apis
    app.post("/registered-camps", async (req, res) => {
      const registeredCamp = req.body;
      const { campId } = registeredCamp;
      const insertResult = await registeredCampCollection.insertOne(
        registeredCamp
      );
      const updateResult = await campCollection.updateOne(
        { _id: new ObjectId(campId) },
        {
          $inc: {
            participantCount: 1,
          },
        }
      );
      res.send(insertResult);
    });

    app.get("/registered-camps", verifyToken, verifyAdmin, async (req, res) => {
      const search = req.query.search || "";
      const { page = 1, limit = 10 } = req.query;
      let searchQuery = {
        $or: [
          { campName: { $regex: search, $options: "i" } },
          { participantName: { $regex: search, $options: "i" } },
          { paymentStatus: { $regex: search, $options: "i" } },
          { confirmationStatus: { $regex: search, $options: "i" } },
        ],
      };
      const pageNumber = parseInt(page);
      const limitNumber = parseInt(limit);
      const totalCount = await registeredCampCollection.countDocuments();
      const result = await registeredCampCollection
        .find(searchQuery)
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .toArray();
      res.send({
        result,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNumber),
        currentPage: pageNumber,
      });
    });

    app.get("/registered-camps/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const search = req.query.search || "";
      const { page = 1, limit = 10 } = req.query;
      const query = { participantEmail: email };
      let searchQuery = {
        $or: [
          { campName: { $regex: search, $options: "i" } },
          { confirmationStatus: { $regex: search, $options: "i" } },
        ],
      };
      const finalQuery = { ...query, ...searchQuery };
      const pageNumber = parseInt(page);
      const limitNumber = parseInt(limit);
      const totalCount = await registeredCampCollection.countDocuments(query);
      const result = await registeredCampCollection
        .find(finalQuery)
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .toArray();
      res.send({
        result,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNumber),
        currentPage: pageNumber,
      });
    });

    app.patch("/registered-camps/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const { confirmationStatus, campId } = req.body;

      const registeredCampQuery = { participantEmail: email, campId: campId };
      const updateCamp = await registeredCampCollection.updateOne(
        registeredCampQuery,
        {
          $set: { confirmationStatus: confirmationStatus },
        }
      );
      const paymentQuery = { email: email, campId: campId };
      const updatePayment = await paymentCollection.updateOne(paymentQuery, {
        $set: { confirmationStatus: confirmationStatus },
      });
      res.send(updateCamp);
    });

    app.delete("/registered-camps/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const registeredCamp = await registeredCampCollection.findOne(query);
      const campId = registeredCamp.campId;
      const result = await registeredCampCollection.deleteOne(query);
      const updateResult = await campCollection.updateOne(
        { _id: new ObjectId(campId) },
        {
          $inc: {
            participantCount: -1,
          },
        }
      );
      res.send(result);
    });

    //analytics
    app.get("/analytics/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const registeredCamps = await registeredCampCollection
        .find({ participantEmail: email })
        .toArray();
      const campIds = registeredCamps.map((camp) => camp.campId);

      const payments = await paymentCollection
        .find({ email: email, campId: { $in: campIds } })
        .toArray();
      const analyticsData = registeredCamps.map((camp) => {
        const payment = payments.find((p) => p.campId === camp.campId) || {};
        return {
          campName: camp.campName,
          campFees: camp.campFees,
          paymentStatus: payment.paymentStatus || "unpaid",
          amountPaid: payment.campFee || 0,
        };
      });

      res.send(analyticsData);
    });

    // stripe payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { campFees } = req.body;
      const amount = parseInt(campFees * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const search = req.query.search || "";
      const { page = 1, limit = 10 } = req.query;
      const query = { email: email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      let searchQuery = {
        $or: [
          { campName: { $regex: search, $options: "i" } },
          { confirmationStatus: { $regex: search, $options: "i" } },
        ],
      };
      const finalQuery = { ...query, ...searchQuery };
      const pageNumber = parseInt(page);
      const limitNumber = parseInt(limit);
      const totalCount = await paymentCollection.countDocuments(query);

      const result = await paymentCollection
        .find(finalQuery)
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .toArray();
      res.send({
        result,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNumber),
        currentPage: pageNumber,
      });
    });

    app.get("/payments", verifyToken, async (req, res) => {
      const result = await paymentCollection.find({}).toArray();
      res.send({
        result,
        totalCount: result.length,
      });
    });
    
    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      const { registeredCampId } = payment;
      const query = { _id: new ObjectId(registeredCampId) };
      const updateResult = await registeredCampCollection.updateOne(query, {
        $set: {
          paymentStatus: "paid",
        },
      });
      res.send(paymentResult);
    });

    // Rating and Feedback
    app.get("/feedback", async (req, res) => {
      const result = await feedbackCollection.find().toArray();
      res.send(result);
    });
    app.post("/feedback", async (req, res) => {
      const feedback = req.body;
      const result = await feedbackCollection.insertOne(feedback);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
