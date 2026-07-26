import os
from flask import Flask, render_template, session, redirect, url_for
from dotenv import load_dotenv

# Import Blueprints
from routes.auth import auth_bp
from routes.pos import pos_bp
from routes.inventory import inventory_bp 
from routes.dashboard import dashboard_bp
from routes.treats import treats_bp

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "super_secret_dev_key")

# Register Blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(pos_bp)
app.register_blueprint(inventory_bp) 
# Add this where you register your blueprints
app.register_blueprint(dashboard_bp)# <-- 2. REGISTER THIS
app.register_blueprint(treats_bp)

@app.route('/')
def landing():
    if 'user_id' in session:
        return redirect(url_for('pos_app'))
    return render_template('landing.html')

@app.route('/app')
def pos_app():
    if 'user_id' not in session:
        return redirect(url_for('landing'))
    return render_template('index.html', username=session.get('username'))

# Add this near your other @app.route functions
@app.route('/api/ping')
def ping():
    """Lightweight endpoint to keep the server awake on Render's free tier"""
    return "OK", 200

if __name__ == '__main__':
    app.run(debug=True, port=5000)