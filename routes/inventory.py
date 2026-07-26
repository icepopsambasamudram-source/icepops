from flask import Blueprint, request, jsonify
from core.db import db
from bson import ObjectId
import json
from bson import json_util
from datetime import datetime

inventory_bp = Blueprint('inventory', __name__)

def parse_json(data):
    return json.loads(json_util.dumps(data))

def calculate_stock(boxes, loose, units_per_box):
    """Standardizes stock to ensure valid box/loose distribution."""
    total_units = (int(boxes) * int(units_per_box)) + int(loose)
    if total_units < 0:
        total_units = 0
    return {
        "boxes_in_stock": total_units // int(units_per_box),
        "loose_units_in_stock": total_units % int(units_per_box),
        "total_absolute_units": total_units
    }

@inventory_bp.route('/api/products', methods=['GET'])
def get_products():
    try:
        products = list(db.products.find({}).sort("updated_at", -1))
        
        # Calculate summary metrics for the dashboard
        total_value = 0
        low_stock_count = 0
        
        for p in products:
            total_units = (p.get('boxes_in_stock', 0) * p.get('units_per_box', 1)) + p.get('loose_units_in_stock', 0)
            total_value += (total_units * p.get('price_per_unit', 0))
            if total_units <= (p.get('low_stock_box_threshold', 1) * p.get('units_per_box', 1)):
                low_stock_count += 1

        return jsonify({
            "products": parse_json(products),
            "metrics": {
                "total_value": total_value,
                "total_items": len(products),
                "low_stock_count": low_stock_count
            }
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@inventory_bp.route('/api/products', methods=['POST'])
def create_product():
    data = request.json
    
    # Validation: Duplicate SKU Check
    if db.products.find_one({"sku": data.get('sku').strip().upper()}):
        return jsonify({"error": f"SKU {data.get('sku')} already exists."}), 400

    stock_data = calculate_stock(
        data.get('boxes_in_stock', 0), 
        data.get('loose_units_in_stock', 0), 
        data.get('units_per_box', 1)
    )

    new_product = {
        "sku": data.get('sku').strip().upper(),
        "name": data.get('name').strip(),
        "category": data.get('category').strip(),
        "price_per_unit": float(data.get('price_per_unit', 0)),
        "boxes_in_stock": stock_data['boxes_in_stock'],
        "units_per_box": int(data.get('units_per_box', 1)),
        "loose_units_in_stock": stock_data['loose_units_in_stock'],
        "low_stock_box_threshold": int(data.get('low_stock_box_threshold', 1)),
        "updated_at": datetime.utcnow()
    }
    
    db.products.insert_one(new_product)
    return jsonify({"message": "Product added successfully!"}), 201

@inventory_bp.route('/api/products/<product_id>', methods=['PUT'])
def update_product(product_id):
    data = request.json
    
    # Validation: SKU uniqueness excluding current product
    existing_sku = db.products.find_one({"sku": data.get('sku').strip().upper(), "_id": {"$ne": ObjectId(product_id)}})
    if existing_sku:
        return jsonify({"error": f"SKU {data.get('sku')} is already used by another product."}), 400

    stock_data = calculate_stock(
        data.get('boxes_in_stock', 0), 
        data.get('loose_units_in_stock', 0), 
        data.get('units_per_box', 1)
    )

    update_fields = {
        "sku": data.get('sku').strip().upper(),
        "name": data.get('name').strip(),
        "category": data.get('category').strip(),
        "price_per_unit": float(data.get('price_per_unit', 0)),
        "boxes_in_stock": stock_data['boxes_in_stock'],
        "units_per_box": int(data.get('units_per_box', 1)),
        "loose_units_in_stock": stock_data['loose_units_in_stock'],
        "low_stock_box_threshold": int(data.get('low_stock_box_threshold', 1)),
        "updated_at": datetime.utcnow()
    }

    db.products.update_one({"_id": ObjectId(product_id)}, {"$set": update_fields})
    return jsonify({"message": "Product updated successfully!"}), 200

@inventory_bp.route('/api/products/<product_id>', methods=['DELETE'])
def delete_product(product_id):
    result = db.products.delete_one({"_id": ObjectId(product_id)})
    if result.deleted_count == 1:
        return jsonify({"message": "Product deleted safely."}), 200
    return jsonify({"error": "Product not found."}), 404