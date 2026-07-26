from flask import Blueprint, request, jsonify, session
from core.db import db
from datetime import datetime
from bson import ObjectId
from bson.errors import InvalidId
import json
from bson import json_util

treats_bp = Blueprint('treats', __name__)

def parse_json(data):
    return json.loads(json_util.dumps(data))

def deduct_inventory_for_treat(product_id, qty_to_deduct):
    try:
        product = db.products.find_one({"_id": ObjectId(product_id)})
    except InvalidId:
        return False, "Invalid Product ID format."

    if not product:
        return False, "Product not found in database."
    
    units_per_box = product.get("units_per_box", 1)
    boxes = product.get("boxes_in_stock", 0)
    loose = product.get("loose_units_in_stock", 0)
    
    total_current_units = (boxes * units_per_box) + loose
    if total_current_units < qty_to_deduct:
        return False, f"Insufficient stock. You only have {total_current_units} units available."
        
    total_new_units = total_current_units - qty_to_deduct
    new_boxes = total_new_units // units_per_box
    new_loose = total_new_units % units_per_box
    
    db.products.update_one(
        {"_id": ObjectId(product_id)},
        {"$set": {
            "boxes_in_stock": new_boxes,
            "loose_units_in_stock": new_loose,
            "updated_at": datetime.utcnow()
        }}
    )
    return True, product

@treats_bp.route('/api/treats', methods=['GET'])
def get_treats():
    try:
        treats = list(db.staff_consumptions.find({}).sort("created_at", -1).limit(50))
        return jsonify(parse_json(treats)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@treats_bp.route('/api/treats/staff', methods=['GET'])
def get_staff_names():
    try:
        staff_names = db.staff_consumptions.distinct("staff_name")
        staff_names = [name for name in staff_names if name and name.strip()]
        return jsonify(staff_names), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@treats_bp.route('/api/treats/summary', methods=['GET'])
def get_treats_summary():
    try:
        pipeline = [
            # UPDATED: Match Treats that have NOT been settled yet
            {"$match": {
                "reason": "Staff/Owner Treat",
                "status": {"$ne": "settled"}
            }},
            {"$group": {
                "_id": "$staff_name",
                "total_owed": {"$sum": {"$multiply": ["$units_consumed", "$unit_cost_val"]}},
                "total_items": {"$sum": "$units_consumed"}
            }},
            {"$sort": {"total_owed": -1}} 
        ]
        
        summary = list(db.staff_consumptions.aggregate(pipeline))
        overall_total = sum(item['total_owed'] for item in summary)
        
        return jsonify({
            "summary": summary,
            "overall_total": overall_total
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# NEW ROUTE: Settle Staff Dues
@treats_bp.route('/api/treats/settle', methods=['POST'])
def settle_dues():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    staff_name = data.get('staff_name')
    
    if not staff_name:
        return jsonify({"error": "Staff name is required"}), 400

    # Find all unsettled treats for this staff member and mark them as settled
    result = db.staff_consumptions.update_many(
        {
            "staff_name": staff_name,
            "reason": "Staff/Owner Treat",
            "status": {"$ne": "settled"}
        },
        {"$set": {
            "status": "settled", 
            "settled_at": datetime.utcnow(), 
            "settled_by": session.get('username')
        }}
    )
    
    if result.modified_count > 0:
        return jsonify({"message": f"Successfully settled dues for {staff_name}."}), 200
    else:
        return jsonify({"message": f"No pending dues found for {staff_name}."}), 200

@treats_bp.route('/api/treats', methods=['POST'])
def log_treat():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    product_id = data.get('product_id')
    
    try:
        units = int(data.get('units_consumed', 1))
    except ValueError:
        return jsonify({"error": "Invalid quantity provided."}), 400

    reason = data.get('reason', 'Staff Treat')
    
    staff_name = data.get('staff_name', '').strip().title()
    if not staff_name:
        return jsonify({"error": "Staff name is required"}), 400
    
    success, result = deduct_inventory_for_treat(product_id, units)
    if not success:
        return jsonify({"error": result}), 400
        
    treat_record = {
        "staff_name": staff_name,
        "product_id": ObjectId(product_id),
        "product_name": result['name'],
        "units_consumed": units,
        "reason": reason,
        "status": "pending", # Added pending status
        "unit_cost_val": result.get('price_per_unit', 0),
        "created_at": datetime.utcnow()
    }
    
    db.staff_consumptions.insert_one(treat_record)
    return jsonify({"message": "Item logged and stock deducted successfully!"}), 201