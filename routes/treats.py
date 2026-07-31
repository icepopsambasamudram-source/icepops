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

def revert_inventory_for_treat(product_id, qty_to_add):
    """Helper function to add stock back when a treat log is deleted."""
    try:
        product = db.products.find_one({"_id": ObjectId(product_id)})
        if not product: return False
        
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
    except:
        return False

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

@treats_bp.route('/api/treats/settle', methods=['POST'])
def settle_dues():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    staff_name = data.get('staff_name')
    if not staff_name: return jsonify({"error": "Staff name is required"}), 400

    result = db.staff_consumptions.update_many(
        {"staff_name": staff_name, "reason": "Staff/Owner Treat", "status": {"$ne": "settled"}},
        {"$set": {"status": "settled", "settled_at": datetime.utcnow(), "settled_by": session.get('username')}}
    )
    
    if result.modified_count > 0:
        return jsonify({"message": f"Successfully settled dues for {staff_name}."}), 200
    else:
        return jsonify({"message": f"No pending dues found for {staff_name}."}), 200

# NEW ROUTE: Delete a treat log and revert the stock
@treats_bp.route('/api/treats/<treat_id>', methods=['DELETE'])
def delete_treat(treat_id):
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        treat = db.staff_consumptions.find_one({"_id": ObjectId(treat_id)})
        if not treat:
            return jsonify({"error": "Log record not found."}), 404
            
        revert_inventory_for_treat(treat['product_id'], treat['units_consumed'])
        db.staff_consumptions.delete_one({"_id": ObjectId(treat_id)})
        
        return jsonify({"message": "Log deleted and stock successfully reverted."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@treats_bp.route('/api/treats', methods=['POST'])
def log_treat():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    items = data.get('items', [])
    reason = data.get('reason', 'Staff Treat')
    staff_name = data.get('staff_name', '').strip().title()
    
    if not staff_name: return jsonify({"error": "Staff name is required"}), 400
    if not items: return jsonify({"error": "At least one product is required"}), 400
    
    records_to_insert = []
    
    # Process multiple items
    for item in items:
        product_id = item.get('product_id')
        try:
            units = int(item.get('units', 1))
        except ValueError:
            return jsonify({"error": "Invalid quantity provided."}), 400

        success, result = deduct_inventory_for_treat(product_id, units)
        if not success:
            # ROLLBACK PREVIOUSLY DEDUCTED ITEMS IF ONE FAILS
            for record in records_to_insert:
                revert_inventory_for_treat(record['product_id'], record['units_consumed'])
            return jsonify({"error": f"Failed on item '{item.get('name', 'Unknown')}': {result}"}), 400
            
        records_to_insert.append({
            "staff_name": staff_name,
            "product_id": ObjectId(product_id),
            "product_name": result['name'],
            "units_consumed": units,
            "reason": reason,
            "status": "pending",
            "unit_cost_val": result.get('price_per_unit', 0),
            "created_at": datetime.utcnow()
        })
    
    if records_to_insert:
        db.staff_consumptions.insert_many(records_to_insert)
        
    return jsonify({"message": "Items logged and stock deducted successfully!"}), 201