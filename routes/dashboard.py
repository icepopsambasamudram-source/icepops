from flask import Blueprint, request, jsonify
from core.db import db
from datetime import datetime
import json
from bson import json_util

dashboard_bp = Blueprint('dashboard', __name__)

def parse_json(data):
    return json.loads(json_util.dumps(data))

@dashboard_bp.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    try:
        start_str = request.args.get('start')
        end_str = request.args.get('end')
        
        if not start_str or not end_str:
            return jsonify({"error": "Start and End dates are required."}), 400

        start_date = datetime.fromisoformat(start_str.replace('Z', '+00:00')).replace(tzinfo=None)
        end_date = datetime.fromisoformat(end_str.replace('Z', '+00:00')).replace(tzinfo=None)

        date_match = {"created_at": {"$gte": start_date, "$lte": end_date}, "status": "completed"}

        # 1. Main KPIs Pipeline (Revenue, Orders, Payment Methods)
        kpi_pipeline = [
            {"$match": date_match},
            {"$group": {
                "_id": None,
                "total_revenue": {"$sum": "$total_amount"},
                "total_orders": {"$sum": 1},
                "cash_total": {"$sum": {"$cond": [{"$eq": ["$payment_method", "cash"]}, "$total_amount", 0]}},
                "upi_total": {"$sum": {"$cond": [{"$eq": ["$payment_method", "upi"]}, "$total_amount", 0]}},
                "split_total": {"$sum": {"$cond": [{"$eq": ["$payment_method", "split"]}, "$total_amount", 0]}}
            }}
        ]
        kpi_result = list(db.orders.aggregate(kpi_pipeline))
        kpis = kpi_result[0] if kpi_result else {
            "total_revenue": 0, "total_orders": 0, "cash_total": 0, "upi_total": 0, "split_total": 0
        }

        # 2. Top Selling Products
        products_pipeline = [
            {"$match": date_match},
            {"$unwind": "$items"},
            {"$group": {
                "_id": "$items.name",
                "quantity_sold": {"$sum": "$items.quantity"},
                "revenue_generated": {"$sum": {"$multiply": ["$items.quantity", "$items.price_at_sale"]}}
            }},
            {"$sort": {"quantity_sold": -1}}
        ]
        top_products = list(db.orders.aggregate(products_pipeline))
        total_products_sold = sum(item['quantity_sold'] for item in top_products)

        # 3. Sales Trend Pipeline
        trend_pipeline = [
            {"$match": date_match},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                "daily_revenue": {"$sum": "$total_amount"}
            }},
            {"$sort": {"_id": 1}}
        ]
        sales_trend = list(db.orders.aggregate(trend_pipeline))

        # 4. Recent Transactions
        recent_orders = list(db.orders.find(date_match).sort("created_at", -1).limit(5))

        # 5. Inventory Overview (Live Stock Data for Dashboard)
        all_products = list(db.products.find({}))
        total_inv_value = 0
        total_inv_items = 0
        low_stock_count = 0
        
        for p in all_products:
            t_units = (p.get('boxes_in_stock', 0) * p.get('units_per_box', 1)) + p.get('loose_units_in_stock', 0)
            thresh = p.get('low_stock_box_threshold', 1) * p.get('units_per_box', 1)
            
            total_inv_items += t_units
            total_inv_value += (t_units * p.get('price_per_unit', 0))
            if t_units <= thresh:
                low_stock_count += 1

        response_data = {
            "kpis": {
                "revenue": kpis.get("total_revenue", 0),
                "orders": kpis.get("total_orders", 0),
                "products_sold": total_products_sold,
                "payments": {
                    "cash": kpis.get("cash_total", 0),
                    "upi": kpis.get("upi_total", 0),
                    "split": kpis.get("split_total", 0)
                },
                "inventory": {
                    "total_value": total_inv_value,
                    "total_items": total_inv_items,
                    "low_stock": low_stock_count
                }
            },
            "charts": {
                "trend": parse_json(sales_trend),
                "top_products": parse_json(top_products[:5])
            },
            "tables": {
                "recent_orders": parse_json(recent_orders)
            }
        }

        return jsonify(response_data), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500