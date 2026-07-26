import os
import certifi
import random
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash
from pymongo import MongoClient
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    print("Error: MONGO_URI not found in .env file.")
    exit(1)

print("Connecting to MongoDB Atlas...")
# Using certifi to prevent the SSL handshake error on Windows
client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client['icepops_db']

def seed_database():
    print("Clearing old collections...")
    db.users.delete_many({})
    db.products.delete_many({})
    db.orders.delete_many({})
    db.staff_consumptions.delete_many({})

    print("1. Seeding User...")
    db.users.insert_one({
        "username": "admin",
        "password_hash": generate_password_hash("admin123"),
        "role": "staff", # Everyone is an owner/staff in this version
        "created_at": datetime.utcnow()
    })

    print("2. Seeding Products...")
    products_data = [
        {
            "sku": "POP-001",
            "name": "Mango Tango Ice Pop",
            "category": "Ice Pops",
            "price_per_unit": 40.0,
            "boxes_in_stock": 5,
            "units_per_box": 24,
            "loose_units_in_stock": 10,
            "low_stock_box_threshold": 2,
            "updated_at": datetime.utcnow()
        },
        {
            "sku": "CON-001",
            "name": "Double Choco Fudge Cone",
            "category": "Cones",
            "price_per_unit": 80.0,
            "boxes_in_stock": 3,
            "units_per_box": 12,
            "loose_units_in_stock": 2,
            "low_stock_box_threshold": 1,
            "updated_at": datetime.utcnow()
        },
        {
            "sku": "SCP-001",
            "name": "Strawberry Splash Scoop",
            "category": "Scoops",
            "price_per_unit": 60.0,
            "boxes_in_stock": 8,
            "units_per_box": 30,
            "loose_units_in_stock": 15,
            "low_stock_box_threshold": 2,
            "updated_at": datetime.utcnow()
        },
        {
            "sku": "BAR-001",
            "name": "Vanilla Almond Bar",
            "category": "Bars",
            "price_per_unit": 50.0,
            "boxes_in_stock": 1, # Purposely low to trigger the low-stock UI warning
            "units_per_box": 20,
            "loose_units_in_stock": 0,
            "low_stock_box_threshold": 2, 
            "updated_at": datetime.utcnow()
        }
    ]
    
    product_ids = []
    for p in products_data:
        result = db.products.insert_one(p)
        p['_id'] = result.inserted_id
        product_ids.append(p)

    print("3. Seeding Orders (Weighted for Today)...")
    for i in range(25):
        # 0 = Today. Heavily weight towards 0 so the dashboard populates instantly on load.
        days_ago = random.choice([0, 0, 0, 0, 1, 2, 3, 5]) 
        order_date = datetime.utcnow() - timedelta(days=days_ago)
        
        order_items = []
        total_amount = 0
        
        # Select 1 to 3 random products for this order
        for _ in range(random.randint(1, 3)):
            prod = random.choice(product_ids)
            qty = random.randint(1, 4)
            price = prod['price_per_unit']
            
            # Avoid duplicates in the same order array
            if not any(item['product_id'] == str(prod['_id']) for item in order_items):
                order_items.append({
                    "product_id": str(prod['_id']),
                    "name": prod['name'],
                    "quantity": qty,
                    "price_at_sale": price
                })
                total_amount += (qty * price)

        if order_items:
            db.orders.insert_one({
                "order_number": f"ORD-{int(order_date.timestamp())}{i}",
                "cashier_name": "admin",
                "items": order_items,
                "total_amount": total_amount,
                "payment_method": random.choice(['cash', 'card', 'upi']),
                "status": "completed",
                "created_at": order_date
            })

    print("4. Seeding Staff Consumptions...")
    for i in range(8):
        days_ago = random.choice([0, 0, 1, 2, 4])
        treat_date = datetime.utcnow() - timedelta(days=days_ago)
        prod = random.choice(product_ids)
        qty = random.randint(1, 2)
        
        db.staff_consumptions.insert_one({
            "staff_name": "admin",
            "product_id": prod['_id'],
            "product_name": prod['name'],
            "units_consumed": qty,
            "reason": random.choice(["Owner Treat", "Damaged/Melted", "Quality Test"]),
            "unit_cost_val": prod['price_per_unit'],
            "created_at": treat_date
        })

    print("\n✅ Database seeded successfully!")
    print("--------------------------------------------------")
    print("You can now start your Flask server and log in with:")
    print("Username: admin")
    print("Password: admin123")
    print("--------------------------------------------------")

if __name__ == "__main__":
    seed_database()