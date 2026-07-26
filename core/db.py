import os
import certifi
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise ValueError("MONGO_URI is missing from your .env file.")

# Initialize the MongoDB client using certifi to prevent SSL handshake errors
client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())

# Export the database instance for use in Blueprints
db = client['icepops_db']