import uuid


def generate_receipt_code():
    return str(uuid.uuid4())[:8].upper()