const express = require('express');
const mongoose = require('mongoose');
const mqtt = require('mqtt');
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------
// Connect to MongoDB Atlas
// ---------------------------
mongoose
  .connect(
    'mongodb+srv://Rio:RioAstal1234@rio.kh2t4sq.mongodb.net/myDatabase?retryWrites=true&w=majority',
    { useNewUrlParser: true, useUnifiedTopology: true }
  )
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

// ---------------------------
// Define Mongoose Schema and Model
// ---------------------------
const sensorDataSchema = new mongoose.Schema({
  Gvalue: { type: Number, default: null },
  Gdate: { type: String, default: null },
  Mvalue: { type: Number, default: null },
  Mdate: { type: String, default: null }
});

// Include virtual "id" when converting to JSON
sensorDataSchema.set('toJSON', { virtuals: true });

const Record = mongoose.model('Record', sensorDataSchema);

// ---------------------------
// Middleware Setup
// ---------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML pages, etc.) from the current directory
app.use(express.static(__dirname));

// ---------------------------
// REST API Endpoints
// ---------------------------

/**
 * GET /data
 * Retrieves records from the database.
 * Use query parameter sensor=G for rainfall data (Gvalue, Gdate)
 * or sensor=M for ammonia gas data (Mvalue, Mdate)
 */
app.get('/data', async (req, res) => {
  const sensor = req.query.sensor;
  let query = {};
  if (sensor === 'G') {
    query = { Gvalue: { $ne: null } };
  } else if (sensor === 'M') {
    query = { Mvalue: { $ne: null } };
  }
  try {
    const records = await Record.find(query);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /data
 * Creates a new record.
 * Expects JSON with sensor data:
 * For rainfall data, include Gvalue and Gdate.
 * For ammonia gas data, include Mvalue and Mdate.
 */
app.post('/data', async (req, res) => {
  const { Gvalue, Gdate, Mvalue, Mdate } = req.body;
  if ((Gvalue === undefined || !Gdate) && (Mvalue === undefined || !Mdate)) {
    return res.status(400).json({ error: 'Required sensor data missing.' });
  }
  try {
    const newRecord = new Record({ Gvalue, Gdate, Mvalue, Mdate });
    await newRecord.save();
    res.status(201).json(newRecord);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /data/:id
 * Updates an existing record by id.
 * Expects JSON with sensor data.
 */
app.put('/data/:id', async (req, res) => {
  const { Gvalue, Gdate, Mvalue, Mdate } = req.body;
  try {
    const updatedRecord = await Record.findByIdAndUpdate(
      req.params.id,
      { Gvalue, Gdate, Mvalue, Mdate },
      { new: true }
    );
    if (!updatedRecord) {
      return res.status(404).json({ error: 'Record not found.' });
    }
    res.json(updatedRecord);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /data/:id
 * Deletes an existing record by id.
 */
app.delete('/data/:id', async (req, res) => {
  try {
    const deletedRecord = await Record.findByIdAndDelete(req.params.id);
    if (!deletedRecord) {
      return res.status(404).json({ error: 'Record not found.' });
    }
    res.json(deletedRecord);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /data/all
 * Deletes all records.
 * Optional: Use query parameter sensor=G or sensor=M to delete specific sensor data.
 */
app.delete('/data/all', async (req, res) => {
  const sensor = req.query.sensor;
  let query = {};
  if (sensor === 'G') {
    query = { Gvalue: { $ne: null } };
  } else if (sensor === 'M') {
    query = { Mvalue: { $ne: null } };
  }
  try {
    await Record.deleteMany(query);
    res.json({ message: 'Records deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error while deleting records.' });
  }
});

// ---------------------------
// Start the Express Server
// ---------------------------
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// ---------------------------
// MQTT Client Integration
// ---------------------------
const device_id = "Device0001";
const mqttServer = "broker.hivemq.com";
const mqttPort = 1883;
const mqttUser = "semini";
const mqttPassword = "Semini17";
const mqttClientId = "hivemq.webclient.1717873306472";
const mqttBrokerUrl = `mqtt://${mqttServer}`;

const mqttClient = mqtt.connect(mqttBrokerUrl, {
  port: mqttPort,
  username: mqttUser,
  password: mqttPassword,
  clientId: mqttClientId
});

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
  // Subscribe to both topics
  mqttClient.subscribe("Garbage", (err) => {
    if (err) {
      console.error('Error subscribing to "Garbage":', err);
    } else {
      console.log('Subscribed to "Garbage"');
    }
  });
  mqttClient.subscribe("Methane", (err) => {
    if (err) {
      console.error('Error subscribing to "Methane":', err);
    } else {
      console.log('Subscribed to "Methane"');
    }
  });
});

mqttClient.on('message', async (topic, message) => {
  const value = parseFloat(message.toString());
  if (isNaN(value)) {
    console.error('Received invalid numeric value:', message.toString());
    return;
  }
  
  // Use the current timestamp in ISO format (you can modify the format if desired)
  const timestamp = new Date().toISOString();
  
  try {
    if (topic === "Garbage") {
      // Save as rainfall reading: Gvalue and Gdate
      const newRecord = new Record({ Gvalue: value, Gdate: timestamp });
      await newRecord.save();
      console.log(`Saved Garbage record:`, newRecord);
    } else if (topic === "Methane") {
      // Save as ammonia gas reading: Mvalue and Mdate
      const newRecord = new Record({ Mvalue: value, Mdate: timestamp });
      await newRecord.save();
      console.log(`Saved Methane record:`, newRecord);
    } else {
      console.log('Received message from unknown topic:', topic);
    }
  } catch (err) {
    console.error('Error saving MQTT message record:', err);
  }
});
