from flask import Blueprint, request, jsonify
from services.biometric_service import verify_face


biometric_bp = Blueprint(
    "biometric",
    __name__
)


@biometric_bp.route(
    "/biometric/verify",
    methods=["POST"]
)
def biometric_verify():

    data = request.get_json(silent=True) or {}

    voter_id = data.get("voterId")
    image = data.get("image")

    if not voter_id:
        return jsonify({
            "success": False,
            "message": "voterId required"
        }), 400

    if not image:
        return jsonify({
            "success": False,
            "message": "image required"
        }), 400

    result = verify_face(
        voter_id,
        image
    )

    return jsonify(result)
    