from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from core.db import db

# Define the Blueprint
auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    if db.users.find_one({"username": username}):
        return jsonify({"error": "User already exists"}), 400
        
    hashed_pw = generate_password_hash(password)
    db.users.insert_one({
        "username": username,
        "password_hash": hashed_pw,
        "role": "owner", # Simplified role architecture
        "created_at": datetime.utcnow()
    })
    
    return jsonify({"message": "User created successfully"}), 201

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    user = db.users.find_one({"username": data.get('username')})
    
    if user and check_password_hash(user['password_hash'], data.get('password')):
        session['user_id'] = str(user['_id'])
        session['username'] = user['username']
        session['role'] = user['role']
        return jsonify({"message": "Login successful", "role": user['role']}), 200
        
    return jsonify({"error": "Invalid credentials"}), 401

@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"}), 200