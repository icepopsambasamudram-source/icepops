from flask import Blueprint, request, jsonify, session
from datetime import datetime
from bson import ObjectId
from core.db import db
import json
from bson import json_util

pos_bp = Blueprint('pos', __name__)

def parse_json(data):
    return json.loads(json_util.dumps(data))

def deduct_inventory(product_id, qty_to_deduct):
    product = db.products.find_one({"_id": ObjectId(product_id)})
    if not product:
        return False, "Product not found"
    
    units_per_box = product.get("units_per_box", 1)
    boxes = product.get("boxes_in_stock", 0)
    loose = product.get("loose_units_in_stock", 0)
    
    total_current_units = (boxes * units_per_box) + loose
    if total_current_units < qty_to_deduct:
        return False, f"Insufficient stock for {product['name']}"
        
    total_new_units = total_current_units - qty_to_deduct
    db.products.update_one(
        {"_id": ObjectId(product_id)},
        {"$set": {
            "boxes_in_stock": total_new_units // units_per_box,
            "loose_units_in_stock": total_new_units % units_per_box,
            "updated_at": datetime.utcnow()
        }}
    )
    return True, ""

def revert_inventory(product_id, qty_to_add):
    product = db.products.find_one({"_id": ObjectId(product_id)})
    if not product:
        return False
    
    units_per_box = product.get("units_per_box", 1)
    boxes = product.get("boxes_in_stock", 0)
    loose = product.get("loose_units_in_stock", 0)
    
    total_new_units = (boxes * units_per_box) + loose + qty_to_add
    db.products.update_one(
        {"_id": ObjectId(product_id)},
        {"$set": {
            "boxes_in_stock": total_new_units // units_per_box,
            "loose_units_in_stock": total_new_units % units_per_box,
            "updated_at": datetime.utcnow()
        }}
    )
    return True

def generate_order_number():
    """Generates an order number in the format DDMMYYXXXX"""
    now = datetime.utcnow()
    date_prefix = now.strftime("%d%m%y")
    
    # Find the latest order for today
    last_order = db.orders.find_one(
        {"order_number": {"$regex": f"^{date_prefix}"}},
        sort=[("order_number", -1)]
    )
    
    if last_order and len(last_order.get("order_number", "")) >= 10:
        try:
            last_seq = int(last_order["order_number"][6:10])
            new_seq = last_seq + 1
        except ValueError:
            new_seq = 1
    else:
        new_seq = 1
        
    return f"{date_prefix}{new_seq:04d}"

@pos_bp.route('/api/orders', methods=['POST'])
def create_order():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    items = data.get('items', [])
    payment_data = data.get('payment', {})
    total = 0
    
    for item in items:
        success, error_msg = deduct_inventory(item['product_id'], item['quantity'])
        if not success:
            return jsonify({"error": error_msg}), 400
        total += (item['price_at_sale'] * item['quantity'])

    # Use the new Order ID generator
    order_number = generate_order_number()

    order = {
        "order_number": order_number,
        "cashier_name": session.get('username'),
        "items": items,
        "total_amount": total,
        "payment_method": payment_data.get('method', 'cash'),
        "cash_received": payment_data.get('cash_amount', 0),
        "upi_received": payment_data.get('upi_amount', 0),
        "change_returned": payment_data.get('change_returned', 0),
        "status": "completed",
        "created_at": datetime.utcnow()
    }
    
    db.orders.insert_one(order)
    # Return the full order data so the frontend can format the WhatsApp bill immediately
    return jsonify({
        "message": "Order completed", 
        "order_number": order_number,
        "order_data": parse_json(order)
    }), 201

@pos_bp.route('/api/orders', methods=['GET'])
def get_orders():
    start_str = request.args.get('start')
    end_str = request.args.get('end')
    search_query = request.args.get('q', '').strip()

    query = {"status": "completed"}

    if start_str and end_str:
        start_date = datetime.fromisoformat(start_str.replace('Z', '+00:00')).replace(tzinfo=None)
        end_date = datetime.fromisoformat(end_str.replace('Z', '+00:00')).replace(tzinfo=None)
        query["created_at"] = {"$gte": start_date, "$lte": end_date}

    if search_query:
        query["order_number"] = {"$regex": search_query, "$options": "i"}

    orders = list(db.orders.find(query).sort("created_at", -1))
    return jsonify(parse_json(orders)), 200

@pos_bp.route('/api/orders/<order_id>', methods=['DELETE'])
def delete_order(order_id):
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    order = db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        return jsonify({"error": "Order not found"}), 404

    for item in order.get('items', []):
        revert_inventory(item['product_id'], item['quantity'])

    db.orders.update_one({"_id": ObjectId(order_id)}, {"$set": {"status": "cancelled", "updated_at": datetime.utcnow()}})
    return jsonify({"message": f"Order {order['order_number']} deleted. Stock reverted."}), 200