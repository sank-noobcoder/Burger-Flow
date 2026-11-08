import re
import json
import logging
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from apps.api.app.models.db import SessionLocal
from apps.api.app.repositories import runs_repo

logger = logging.getLogger("security_firewall")

# High-precision RegEx patterns for malicious payload detection
MALICIOUS_PATTERNS = [
    # SQL Injection Patterns
    (re.compile(r"(\bUNION\s+ALL\s+SELECT\b|\bUNION\s+SELECT\b|\bDROP\s+TABLE\b|\bINSERT\s+INTO\b|\bDELETE\s+FROM\b|\bSELECT\s+.*\s+FROM\b)", re.IGNORECASE), "sql_statement_injection"),
    (re.compile(r"(\bOR\s+['\"]?1['\"]?\s*=\s*['\"]?1['\"]?|'\s+OR\s+['\"]?1['\"]?\s*=\s*['\"]?1['\"]?)", re.IGNORECASE), "sql_boolean_bypass"),
    (re.compile(r"(['\"][^'\"]*--\s*$|;\s*--|/\*.*?\*/|;\s*SHUTDOWN|;\s*EXEC\s+|xp_cmdshell)", re.IGNORECASE), "sql_exec_comment"),
    (re.compile(r"(\bBENCHMARK\s*\(|\bSLEEP\s*\(|\bWAITFOR\s+DELAY\b)", re.IGNORECASE), "sql_time_injection"),
    
    # Path Traversal & OS Command Injection
    (re.compile(r"(\.\./\.\./|\.\.\\\.\.\\|/etc/passwd|/windows/system32|cmd\.exe|powershell\.exe)", re.IGNORECASE), "path_traversal_command_injection"),
    (re.compile(r"(;\s*rm\s+-rf|;\s*cat\s+/etc/|;\s*net\s+user|\|\s*bash\b)", re.IGNORECASE), "os_command_chaining"),
    
    # Cross-Site Scripting (XSS)
    (re.compile(r"(<script.*?>|javascript:|onload\s*=|onerror\s*=|document\.cookie)", re.IGNORECASE), "xss_injection"),
]


def inspect_text_for_malice(text: str) -> str | None:
    """Scans text string against malicious threat signatures."""
    if not text or len(text) < 3:
        return None
    for pattern, threat_type in MALICIOUS_PATTERNS:
        if pattern.search(text):
            return threat_type
    return None


def inspect_data_recursively(data) -> str | None:
    """Recursively inspects lists, dicts, and nested JSON values."""
    if isinstance(data, str):
        return inspect_text_for_malice(data)
    elif isinstance(data, dict):
        for k, v in data.items():
            k_threat = inspect_text_for_malice(str(k))
            if k_threat:
                return k_threat
            v_threat = inspect_data_recursively(v)
            if v_threat:
                return v_threat
    elif isinstance(data, list):
        for item in data:
            item_threat = inspect_data_recursively(item)
            if item_threat:
                return item_threat
    return None


class SecurityFirewallMiddleware(BaseHTTPMiddleware):
    """
    Validates every incoming API request for malicious patterns,
    SQL injection, command execution, path traversal, and XSS.
    Rejects attacks with HTTP 403 Forbidden and records security audit logs.
    """

    async def dispatch(self, request: Request, call_next):
        # Allow internal docs / openapi / static
        path = request.url.path
        if path.startswith("/docs") or path.startswith("/openapi.json") or path == "/healthz" or path == "/readyz":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"

        # 1. Validate Query Parameters
        for q_key, q_val in request.query_params.items():
            threat = inspect_text_for_malice(f"{q_key}={q_val}")
            if threat:
                logger.warning(f"[SECURITY BLOCKED] IP: {client_ip} Path: {path} Query Threat: {threat}")
                self._record_audit_violation(client_ip, threat, f"Query Param Violation: {q_key}={q_val}")
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": "Request rejected by BurgersFlow Security Firewall: Malicious query pattern detected.",
                        "code": "SECURITY_VIOLATION_BLOCKED",
                        "threat_signature": threat,
                    }
                )

        # 2. Validate URL Path
        path_threat = inspect_text_for_malice(path)
        if path_threat:
            logger.warning(f"[SECURITY BLOCKED] IP: {client_ip} Path Threat: {path_threat} in {path}")
            self._record_audit_violation(client_ip, path_threat, f"URL Path Violation: {path}")
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Request rejected by BurgersFlow Security Firewall: Malicious path pattern detected.",
                    "code": "SECURITY_VIOLATION_BLOCKED",
                    "threat_signature": path_threat,
                }
            )

        # 3. Validate Request Body for POST / PUT / PATCH
        if request.method in ["POST", "PUT", "PATCH"]:
            # Check content length
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > 2 * 1024 * 1024:  # 2MB max
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Payload too large (Max 2MB allowed).", "code": "PAYLOAD_TOO_LARGE"}
                )

            body_bytes = await request.body()
            if body_bytes:
                content_type = request.headers.get("content-type", "")
                if "application/json" in content_type:
                    try:
                        body_json = json.loads(body_bytes.decode("utf-8"))
                        body_threat = inspect_data_recursively(body_json)
                        if body_threat:
                            logger.warning(f"[SECURITY BLOCKED] IP: {client_ip} Path: {path} Body Threat: {body_threat}")
                            self._record_audit_violation(client_ip, body_threat, f"Body Payload Violation: {body_threat}")
                            return JSONResponse(
                                status_code=403,
                                content={
                                    "detail": "Request rejected by BurgersFlow Security Firewall: Malicious payload signature detected.",
                                    "code": "SECURITY_VIOLATION_BLOCKED",
                                    "threat_signature": body_threat,
                                }
                            )
                    except json.JSONDecodeError:
                        pass

                # Properly re-inject body into ASGI receive stream with single-read EOF
                has_consumed = False
                async def receive():
                    nonlocal has_consumed
                    if not has_consumed:
                        has_consumed = True
                        return {"type": "http.request", "body": body_bytes, "more_body": False}
                    return {"type": "http.request", "body": b"", "more_body": False}

                request._receive = receive

        return await call_next(request)

    def _record_audit_violation(self, ip: str, threat: str, detail: str):
        """Records security violation into AuditLog database table."""
        try:
            db = SessionLocal()
            runs_repo.add_audit_log(
                db=db,
                action="firewall_blocked_attack",
                user_id=None,
                ip=ip,
                detail=f"[{threat}] {detail[:200]}"
            )
            db.close()
        except Exception as e:
            logger.error(f"Failed to record security audit log: {e}")
