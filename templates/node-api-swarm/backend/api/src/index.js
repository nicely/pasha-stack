const express = require('express');
const { MongoClient } = require('mongodb');
const { readFileSync } = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const mongoUri = getMongoUri();

let mongoClient;
let db;

app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    if (db) {
      await db.command({ ping: 1 });
    }

    res.status(200).json({
      status: 'ok',
      mongo: db ? 'connected' : 'disabled',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message
    });
  }
});

app.get('/', async (req, res) => {
  const message = await getMessage();

  res.status(200).json({
    message,
    timestamp: new Date().toISOString()
  });
});

async function start() {
  if (mongoUri) {
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    db = mongoClient.db();
    console.log('Connected to MongoDB');
  } else {
    console.log('MongoDB URI not configured; API will use fallback data');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server running on port ${PORT}`);
  });
}

async function getMessage() {
  if (!db) {
    return 'API is running';
  }

  const collection = db.collection('messages');
  const now = new Date().toISOString();
  const document = await collection.findOneAndUpdate(
    { _id: 'main' },
    {
      $setOnInsert: {
        message: 'API is running from MongoDB',
        createdAt: now
      },
      $set: {
        updatedAt: now
      }
    },
    {
      upsert: true,
      returnDocument: 'after'
    }
  );

  return document.message;
}

function getMongoUri() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  if (process.env.MONGODB_URI_FILE) {
    return readFileSync(process.env.MONGODB_URI_FILE, 'utf8').trim();
  }

  return '';
}

process.on('SIGTERM', async () => {
  if (mongoClient) {
    await mongoClient.close();
  }

  process.exit(0);
});

start().catch(error => {
  console.error(error);
  process.exit(1);
});
