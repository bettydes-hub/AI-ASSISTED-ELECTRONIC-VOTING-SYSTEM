# placeholder
"""
AI-Based Electronic Voting System - Flask Backend
"""
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:3000"])

# API routes will be registered here
from routes import auth, users, elections, votes, audit

app.register_blueprint(auth.bp, url_prefix="/api/auth")
app.register_blueprint(users.bp, url_prefix="/api/users")
app.register_blueprint(elections.bp, url_prefix="/api/elections")
app.register_blueprint(votes.bp, url_prefix="/api/votes")
app.register_blueprint(audit.bp, url_prefix="/api/audit")

@app.route("/api/health")
def health():
    return {"status": "ok", "message": "E-Voting System API"}

if __name__ == "__main__":
    app.run(debug=True, port=5000)
