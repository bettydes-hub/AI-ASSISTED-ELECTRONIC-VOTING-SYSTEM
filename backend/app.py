"""AI-Based Electronic Voting System - Flask Backend."""

import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, abort, send_file
from flask_cors import CORS

from db import init_db
from routes.admin_routes import admin_bp
from routes.audit_routes import audit_bp
from routes.auth_routes import auth_bp
from routes.candidate_party_routes import candidate_party_bp
from routes.election_routes import election_bp
from routes.result_routes import result_bp
from routes.system_routes import system_bp
from routes.voter_routes import voter_bp
from routes.voting_routes import voting_bp
from services.candidate_file_service import candidate_upload_dir
from services.party_file_service import allowed_file_basename
from routes.voter_routes import voter_bp
from routes.biometric_routes import biometric_bp
PROJECT_ROOT_ENV = Path(__file__).resolve().parent.parent / ".env"
BACKEND_DIR = Path(__file__).resolve().parent
PARTY_UPLOAD_ROOT = BACKEND_DIR / "uploads"
load_dotenv(dotenv_path=PROJECT_ROOT_ENV, override=True)

app = Flask(__name__)


def _parse_cors_origins() -> list[str]:
    raw = os.getenv("FRONTEND_ORIGINS", "").strip()
    if raw:
        return [item.strip() for item in raw.split(",") if item.strip()]
    single = os.getenv("FRONTEND_ORIGIN", "").strip()
    if single:
        return [single]
    # Dev-friendly defaults: Next dev is commonly opened via localhost or LAN IP.
    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.1.2:3000",
    ]


CORS(app, origins=_parse_cors_origins())

app.register_blueprint(election_bp, url_prefix="/api")
app.register_blueprint(candidate_party_bp, url_prefix="/api")
app.register_blueprint(result_bp, url_prefix="/api")
app.register_blueprint(auth_bp, url_prefix="/api")
app.register_blueprint(voter_bp, url_prefix="/api")
app.register_blueprint(voting_bp, url_prefix="/api")
app.register_blueprint(admin_bp, url_prefix="/api")
app.register_blueprint(audit_bp, url_prefix="/api")
app.register_blueprint(system_bp, url_prefix="/api")
app.register_blueprint( biometric_bp,url_prefix="/api")
init_db()


@app.get("/api/party-files/<int:party_id>/<fname>")
def serve_party_file(party_id: int, fname: str):
    if not allowed_file_basename(fname):
        abort(400)
    path = (PARTY_UPLOAD_ROOT / "parties" / str(party_id) / fname).resolve()
    try:
        path.relative_to(PARTY_UPLOAD_ROOT.resolve())
    except ValueError:
        abort(404)
    if not path.is_file():
        abort(404)
    return send_file(path)


@app.get("/api/candidate-files/<int:candidate_id>/<fname>")
def serve_candidate_file(candidate_id: int, fname: str):
    if not allowed_file_basename(fname):
        abort(400)
    path = (candidate_upload_dir(BACKEND_DIR, candidate_id) / fname).resolve()
    try:
        path.relative_to(PARTY_UPLOAD_ROOT.resolve())
    except ValueError:
        abort(404)
    if not path.is_file():
        abort(404)
    return send_file(path)


@app.get("/api/health")
def health():
    return {"status": "ok", "message": "E-Voting API ready"}

@app.get("/")
def home():
    return {
        "message": "AI E-Voting Backend Running"
    }

if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    port = int(os.getenv("BACKEND_PORT", "5000"))
    app.run(debug=debug_mode, port=port)
