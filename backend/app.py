"""AI-Based Electronic Voting System - Flask Backend."""

import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from db import init_db
from routes.candidate_party_routes import candidate_party_bp
from routes.election_routes import election_bp
from routes.result_routes import result_bp

PROJECT_ROOT_ENV = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=PROJECT_ROOT_ENV, override=True)

app = Flask(__name__)
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
CORS(app, origins=[frontend_origin])

app.register_blueprint(election_bp, url_prefix="/api")
app.register_blueprint(candidate_party_bp, url_prefix="/api")
app.register_blueprint(result_bp, url_prefix="/api")
init_db()


@app.get("/api/health")
def health():
    return {"status": "ok", "message": "Election Board module API ready"}


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    port = int(os.getenv("BACKEND_PORT", "5000"))
    app.run(debug=debug_mode, port=port)
