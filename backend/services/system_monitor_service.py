"""In-memory system runtime status for maintenance endpoints."""

from __future__ import annotations

from datetime import datetime

SYSTEM_STATE = {
    "suspended": False,
    "additional_monitoring": False,
    "last_backup_restore": None,
    "last_integrity_check": None,
    "last_config_update": None,
    "last_patch_update": None,
    "patch_failure_count": 0,
    "alerts": [],
    "failure_state": {
        "active": False,
        "category": None,
        "description": None,
        "detected_at": None,
        "diagnosis": None,
        "last_resolution": None,
        "requires_reschedule": False,
        "rescheduled_election_ids": [],
    },
    "system_parameters": {
        "max_login_attempts": 5,
        "session_timeout_minutes": 30,
        "api_rate_limit_per_minute": 120,
    },
    "access_levels": {
        "SystemAdmin": ["system_config", "maintenance", "security_logs", "user_management"],
        "ElectionBoard": ["election_setup", "results_review"],
        "ElectionOfficer": ["voter_registration", "station_operations"],
        "AuditAuthority": ["audit_logs", "audit_reports"],
        "Voter": ["vote", "status"],
    },
}


def append_alert(message: str, severity: str = "warning", source: str = "system") -> dict:
    alert = {
        "message": message,
        "severity": severity,
        "source": source,
        "created_at": datetime.utcnow().isoformat(),
    }
    SYSTEM_STATE["alerts"] = [alert, *SYSTEM_STATE["alerts"]][:100]
    return alert
