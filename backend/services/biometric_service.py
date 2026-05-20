import os
import cv2
import base64
import numpy as np

from repositories.voter_repository import get_voter_by_id

FACES_DIR = "storage/faces"


def verify_face(voter_id, image_data):
    voter = get_voter_by_id(voter_id)

    if not voter:
        return {
            "success": False,
            "message": "Invalid voter"
        }

    if voter.has_voted:
        return {
            "success": False,
            "message": "Already voted"
        }

    image_path = os.path.join(FACES_DIR, f"{voter_id}.jpg")

    if not os.path.exists(image_path):
        return {
            "success": False,
            "message": "Registered face not found"
        }

    try:
        # -------------------------
        # Load stored face safely
        # -------------------------
        saved = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)

        if saved is None:
            return {
                "success": False,
                "message": "Invalid stored face image"
            }

        saved = cv2.resize(saved, (200, 200))

        # -------------------------
        # Validate input image
        # -------------------------
        if not isinstance(image_data, str):
            return {
                "success": False,
                "message": "Invalid image format"
            }

        # Extract base64 part
        if "," in image_data:
            base64_part = image_data.split(",")[1]
        else:
            base64_part = image_data

        decoded = base64.b64decode(base64_part)

        np_array = np.frombuffer(decoded, np.uint8)

        captured = cv2.imdecode(np_array, cv2.IMREAD_GRAYSCALE)

        if captured is None:
            return {
                "success": False,
                "message": "Could not decode image"
            }

        captured = cv2.resize(captured, (200, 200))

        # -------------------------
        # Compare faces
        # -------------------------
        difference = cv2.absdiff(saved, captured)
        score = np.mean(difference)

        if score < 45:
            return {
                "success": True,
                "message": "Face verified"
            }

        return {
            "success": False,
            "message": "Face mismatch"
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"Error: {str(e)}"
        }