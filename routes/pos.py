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
    """Adds stock back when a bill is deleted/cancelled."""
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

    order = {
        "order_number": f"ORD-{int(datetime.utcnow().timestamp())}",
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
    return jsonify({"message": "Order completed", "order_number": order["order_number"]}), 201

@pos_bp.route('/api/orders', methods=['GET'])
def get_orders():
    """Fetch orders with date filtering and search."""
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
    """Cancel an order and revert the stock."""
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    order = db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        return jsonify({"error": "Order not found"}), 404

    # Revert inventory for each item
    for item in order.get('items', []):
        revert_inventory(item['product_id'], item['quantity'])

    # Delete or mark as cancelled
    db.orders.update_one({"_id": ObjectId(order_id)}, {"$set": {"status": "cancelled", "updated_at": datetime.utcnow()}})
    
    return jsonify({"message": f"Order {order['order_number']} deleted. Stock reverted."}), 200