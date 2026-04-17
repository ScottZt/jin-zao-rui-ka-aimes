"""
MCP reporting client for the current AIMS system only.

This module only supports the local project's API:
- /api/v1/work-orders
- /api/v1/work-report-items
- /api/v1/skills/users
- /api/v1/processes

Legacy production-execution endpoints are intentionally removed.
"""

import json
import logging
import os
import re
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    from dotenv import load_dotenv
except Exception:
    def load_dotenv() -> None:
        return None


logger = logging.getLogger("ProductionReporting")
BACKEND_SOURCE = "aimes-v1"
_ACTIVE_BASE_URL: Optional[str] = None

if sys.platform == "win32":
    sys.stderr.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv()


def _get_base_url() -> str:
    """
    Get AIMS backend base URL.

    Priority:
    1) AIMES_BASE_URL
    2) WHEEL_APP_BASE_URL (compat env key)
    3) http://localhost:3101
    """
    for env_key in ("AIMES_BASE_URL", "WHEEL_APP_BASE_URL"):
        raw = os.getenv(env_key)
        if raw and raw.strip():
            return raw.strip().rstrip("/")
    return "http://localhost:3101"


def _candidate_base_urls() -> list[str]:
    """
    Build candidate backend base URLs for auto-discovery.
    """
    candidates: list[str] = []
    for env_key in ("AIMES_BASE_URL", "WHEEL_APP_BASE_URL"):
        raw = os.getenv(env_key)
        if raw and raw.strip():
            candidates.append(raw.strip().rstrip("/"))

    for port_key in ("API_PORT", "PORT"):
        port_val = _safe_text(os.getenv(port_key))
        if port_val.isdigit():
            candidates.append(f"http://localhost:{port_val}")
            candidates.append(f"http://127.0.0.1:{port_val}")

    candidates.extend(
        [
            "http://localhost:3101",
            "http://127.0.0.1:3101",
        ]
    )

    unique: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        if item and item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


def _get_active_base_url() -> str:
    """
    Return cached active URL if available, otherwise discover once.
    """
    global _ACTIVE_BASE_URL
    if _ACTIVE_BASE_URL:
        return _ACTIVE_BASE_URL
    probe = _fetch_work_orders_result()
    if probe.get("success"):
        _ACTIVE_BASE_URL = _safe_text(probe.get("baseUrl"))
        if _ACTIVE_BASE_URL:
            return _ACTIVE_BASE_URL
    return _get_base_url()


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _attach_backend(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Attach current backend source tag to tool responses.
    """
    if isinstance(result, dict) and "backend" not in result:
        result["backend"] = BACKEND_SOURCE
    return result


def _normalize_text(value: str) -> str:
    return _safe_text(value).replace(" ", "").upper()


def _build_target_candidates(source: str) -> list[str]:
    """
    Build normalized target candidates from natural-language input.

    Examples:
    - "尾号01" -> ["尾号01", "01"]
    - "工单编号 WO-20260416-001" -> ["工单编号WO-20260416-001", "WO-20260416-001", "20260416001", ...]
    """
    raw = _safe_text(source)
    if not raw:
        return []

    normalized_full = _normalize_text(raw)
    candidates: list[str] = [normalized_full]

    # Strip common Chinese voice prefixes while keeping the core identifier.
    stripped = re.sub(r"(工单编号|工单号|工单|编号|报工)", "", raw, flags=re.IGNORECASE)
    stripped_norm = _normalize_text(stripped)
    if stripped_norm:
        candidates.append(stripped_norm)

    # Explicit "尾号xxx" extraction.
    suffix_match = re.search(r"尾号[:：\s-]*([A-Za-z0-9]+)", raw, flags=re.IGNORECASE)
    if suffix_match:
        candidates.append(_normalize_text(suffix_match.group(1)))

    # General trailing alnum token (voice often puts key info at the end).
    tail_match = re.search(r"([A-Za-z0-9]+)\s*$", raw)
    if tail_match:
        candidates.append(_normalize_text(tail_match.group(1)))

    # Digits only candidate (e.g., "WO-20260416-001" -> "20260416001")
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        candidates.append(digits)
        # keep the most practical suffix window to avoid overmatching
        candidates.append(digits[-6:])
        candidates.append(digits[-4:])
        candidates.append(digits[-2:])

    # Remove empties and deduplicate while preserving order.
    output: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        value = _safe_text(item)
        if not value:
            continue
        if value in seen:
            continue
        seen.add(value)
        output.append(value)
    return output


def _get_json(url: str, params: Optional[Dict[str, Any]] = None, timeout: int = 10) -> Dict[str, Any]:
    try:
        if params:
            query = urlencode({k: v for k, v in params.items() if v is not None})
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}{query}"
        req = Request(url, headers={"Accept": "application/json"})
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            content_type = resp.headers.get("Content-Type", "")
            if "application/json" in content_type:
                data = json.loads(raw)
            else:
                data = {"raw": raw}
            return {"success": True, "status": resp.status, "data": data}
    except HTTPError as exc:
        try:
            body = exc.read().decode("utf-8")
        except Exception:
            body = str(exc)
        return {"success": False, "status": exc.code, "error": body}
    except URLError as exc:
        return {"success": False, "status": None, "error": str(exc.reason)}
    except Exception as exc:
        return {"success": False, "status": None, "error": str(exc)}


def _post_json(url: str, payload: Dict[str, Any], timeout: int = 15) -> Dict[str, Any]:
    try:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            content_type = resp.headers.get("Content-Type", "")
            if "application/json" in content_type:
                data = json.loads(raw)
            else:
                data = {"raw": raw}
            return {"success": True, "status": resp.status, "data": data}
    except HTTPError as exc:
        try:
            body = exc.read().decode("utf-8")
        except Exception:
            body = str(exc)
        return {"success": False, "status": exc.code, "error": body}
    except URLError as exc:
        return {"success": False, "status": None, "error": str(exc.reason)}
    except Exception as exc:
        return {"success": False, "status": None, "error": str(exc)}


def _extract_data_list(resp: Dict[str, Any]) -> list[Dict[str, Any]]:
    if not resp.get("success"):
        return []
    payload = resp.get("data")
    if not isinstance(payload, dict):
        return []
    if payload.get("code") != 200:
        return []
    data = payload.get("data")
    if isinstance(data, list):
        return data
    return []


def _fetch_work_orders() -> list[Dict[str, Any]]:
    base = _get_active_base_url()
    resp = _get_json(f"{base}/api/v1/work-orders")
    return _extract_data_list(resp)


def _fetch_work_orders_result() -> Dict[str, Any]:
    """
    Fetch work-order list with diagnostic metadata for troubleshooting.
    """
    global _ACTIVE_BASE_URL
    attempts: list[Dict[str, Any]] = []
    for base in _candidate_base_urls():
        endpoint = f"{base}/api/v1/work-orders"
        resp = _get_json(endpoint)
        if not resp.get("success"):
            attempts.append(
                {
                    "baseUrl": base,
                    "endpoint": endpoint,
                    "error": resp.get("error"),
                    "status": resp.get("status"),
                }
            )
            continue
        payload = resp.get("data")
        if not isinstance(payload, dict):
            attempts.append(
                {
                    "baseUrl": base,
                    "endpoint": endpoint,
                    "error": "invalid work-order response payload",
                    "upstreamData": payload,
                }
            )
            continue
        if payload.get("code") != 200:
            attempts.append(
                {
                    "baseUrl": base,
                    "endpoint": endpoint,
                    "error": "work-order api returned non-200 code",
                    "upstreamData": payload,
                }
            )
            continue
        rows = payload.get("data")
        if not isinstance(rows, list):
            attempts.append(
                {
                    "baseUrl": base,
                    "endpoint": endpoint,
                    "error": "work-order list is not an array",
                    "upstreamData": payload,
                }
            )
            continue
        _ACTIVE_BASE_URL = base
        return {"success": True, "rows": rows, "baseUrl": base, "endpoint": endpoint}

    return {
        "success": False,
        "error": "failed to fetch work orders from all candidate base urls",
        "attempts": attempts,
    }


def _fetch_users() -> list[Dict[str, Any]]:
    base = _get_active_base_url()
    resp = _get_json(f"{base}/api/v1/skills/users")
    return _extract_data_list(resp)


def _fetch_processes() -> list[Dict[str, Any]]:
    base = _get_active_base_url()
    resp = _get_json(f"{base}/api/v1/processes")
    return _extract_data_list(resp)


def _resolve_work_order(target: str) -> Dict[str, Any]:
    if not target or not _safe_text(target):
        return {"success": False, "error": "invalid target"}
    source = _safe_text(target)
    normalized_targets = _build_target_candidates(source)
    if not normalized_targets:
        return {"success": False, "error": "invalid target"}
    fetch_result = _fetch_work_orders_result()
    if not fetch_result.get("success"):
        return fetch_result
    rows = fetch_result.get("rows") or []
    if not rows:
        return {
            "success": False,
            "error": "no work orders available",
            "baseUrl": fetch_result.get("baseUrl"),
            "endpoint": fetch_result.get("endpoint"),
        }

    candidates: list[Dict[str, Any]] = []
    for row in rows:
        order_id = _safe_text(row.get("id"))
        order_no = _safe_text(row.get("orderNo"))
        if not order_id or not order_no:
            continue
        normalized_id = _normalize_text(order_id)
        normalized_no = _normalize_text(order_no)

        score = 0
        matched_by = ""
        matched_target = ""
        for normalized_target in normalized_targets:
            cur_score = 0
            cur_match = ""
            if normalized_target == normalized_id:
                cur_score = 120
                cur_match = "exact_id"
            elif normalized_target == normalized_no:
                cur_score = 110
                cur_match = "exact_order_no"
            elif normalized_no.endswith(normalized_target):
                cur_score = 90
                cur_match = "suffix_order_no"
            elif normalized_target in normalized_no:
                cur_score = 70
                cur_match = "contains_order_no"
            if cur_score > score:
                score = cur_score
                matched_by = cur_match
                matched_target = normalized_target

        if score > 0:
            candidates.append(
                {
                    "id": order_id,
                    "orderNo": order_no,
                    "status": row.get("status"),
                    "createdAt": row.get("createdAt"),
                    "score": score,
                    "matchedBy": matched_by,
                    "matchedTarget": matched_target,
                    "row": row,
                }
            )

    if not candidates:
        return {
            "success": False,
            "error": "work order not found by target",
            "target": source,
            "targetCandidates": normalized_targets,
            "baseUrl": fetch_result.get("baseUrl"),
            "endpoint": fetch_result.get("endpoint"),
        }

    candidates.sort(
        key=lambda item: (int(item.get("score") or 0), _safe_text(item.get("createdAt"))),
        reverse=True,
    )
    top_score = int(candidates[0].get("score") or 0)
    top = [item for item in candidates if int(item.get("score") or 0) == top_score]
    if len(top) > 1:
        return {
            "success": False,
            "error": "ambiguous target",
            "candidates": [
                {
                    "id": item.get("id"),
                    "orderNo": item.get("orderNo"),
                    "status": item.get("status"),
                    "matchedBy": item.get("matchedBy"),
                    "matchedTarget": item.get("matchedTarget"),
                }
                for item in top[:5]
            ],
        }
    return {"success": True, "matchedBy": top[0].get("matchedBy"), "row": top[0]["row"]}


def _guess_shift_name(now: Optional[datetime] = None) -> str:
    ts = now or datetime.now()
    hour = ts.hour
    if 6 <= hour < 14:
        return "\u65e9\u73ed"
    if 14 <= hour < 22:
        return "\u665a\u73ed"
    return "\u591c\u73ed"


def _pick_process_name(work_order: Dict[str, Any]) -> str:
    plans = work_order.get("processPlans")
    if not isinstance(plans, list) or not plans:
        return "\u8517\u83dc\u5207\u914d"

    for wanted_status in ("active", "pending", "draft"):
        for plan in plans:
            if _safe_text(plan.get("status")) == wanted_status and _safe_text(plan.get("processName")):
                return _safe_text(plan.get("processName"))
    for plan in plans:
        if _safe_text(plan.get("processName")):
            return _safe_text(plan.get("processName"))
    return "\u8517\u83dc\u5207\u914d"


def _resolve_operator(
    operator_id: Optional[Any] = None,
    operator_code: Optional[str] = None,
    operator_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    users = _fetch_users()
    if not users:
        return None

    if operator_id is not None and _safe_text(operator_id):
        wanted = _safe_text(operator_id)
        for user in users:
            if _safe_text(user.get("id")) == wanted:
                return user

    env_id = _safe_text(os.getenv("DEFAULT_OPERATOR_ID"))
    if env_id:
        for user in users:
            if _safe_text(user.get("id")) == env_id:
                return user

    if operator_code:
        wanted_code = _safe_text(operator_code)
        for user in users:
            if _safe_text(user.get("cardId")) == wanted_code:
                return user

    if operator_name:
        wanted_name = _safe_text(operator_name)
        for user in users:
            if _safe_text(user.get("name")) == wanted_name:
                return user

    return users[0]


def _submit_v1_work_report_item(
    work_order: Dict[str, Any],
    operator: Dict[str, Any],
    report_quantity: int,
    qualified_quantity: int,
    unqualified_quantity: int,
    remark: Optional[str],
) -> Dict[str, Any]:
    if report_quantity < 0 or qualified_quantity < 0 or unqualified_quantity < 0:
        return _attach_backend({"success": False, "error": "invalid quantity values"})

    process_name = _pick_process_name(work_order)
    process_code = None
    for proc in _fetch_processes():
        if _safe_text(proc.get("processName")) == process_name:
            process_code = _safe_text(proc.get("processCode")) or None
            break

    skill_level = 1
    skill = operator.get("skill")
    if isinstance(skill, dict):
        try:
            level = int(skill.get("level") or 1)
            if level > 0:
                skill_level = level
        except Exception:
            skill_level = 1

    base = _get_active_base_url()
    payload = {
        "reporterId": _safe_text(operator.get("id")),
        "workOrderId": _safe_text(work_order.get("id")),
        "shiftName": _guess_shift_name(),
        "remark": remark,
        "userId": _safe_text(operator.get("id")),
        "processCode": process_code,
        "processName": process_name,
        "productId": _safe_text(work_order.get("productId")),
        "goodQty": max(0, int(qualified_quantity)),
        "badQty": max(0, int(unqualified_quantity)),
        "lossQty": 0,
        "equipment": None,
        "skillLevel": skill_level,
    }
    response = _post_json(f"{base}/api/v1/work-report-items", payload)
    if not response.get("success"):
        return _attach_backend(response)
    data = response.get("data")
    if not isinstance(data, dict):
        return _attach_backend({"success": False, "error": "invalid response from /api/v1/work-report-items"})
    return _attach_backend({
        "success": data.get("code") == 200,
        "status": response.get("status"),
        "data": data,
        "matchedWorkOrder": {
            "id": work_order.get("id"),
            "orderNo": work_order.get("orderNo"),
        },
    })


def report_work_order_by_id(
    work_order_id: Any,
    operator_id: Any,
    operator_code: str,
    operator_name: str,
    report_quantity: int,
    qualified_quantity: int,
    unqualified_quantity: int,
    work_time: Optional[int] = None,
    remark: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Report by work-order target (id/orderNo fragment) to /api/v1/work-report-items.
    """
    del work_time  # not used by current /api/v1/work-report-items
    if report_quantity < 0 or qualified_quantity < 0 or unqualified_quantity < 0:
        return _attach_backend({"success": False, "error": "invalid quantity values"})
    if _safe_text(work_order_id) == "":
        return _attach_backend({"success": False, "error": "invalid work_order_id"})
    resolved = _resolve_work_order(_safe_text(work_order_id))
    if not resolved.get("success"):
        return _attach_backend(resolved)
    operator = _resolve_operator(operator_id=operator_id, operator_code=operator_code, operator_name=operator_name)
    if not operator:
        return _attach_backend({"success": False, "error": "operator not found"})
    return _submit_v1_work_report_item(
        work_order=resolved["row"],
        operator=operator,
        report_quantity=report_quantity,
        qualified_quantity=qualified_quantity,
        unqualified_quantity=unqualified_quantity,
        remark=remark,
    )


def scan_report_work_order(
    barcode: str,
    operator_id: Any,
    operator_code: str,
    operator_name: str,
    report_quantity: int,
    qualified_quantity: int,
    unqualified_quantity: int,
    work_time: Optional[int] = None,
    remark: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Barcode scan reporting for current system.
    For AIMS, barcode is treated as work-order target text.
    """
    del work_time
    if not barcode or not _safe_text(barcode):
        return _attach_backend({"success": False, "error": "invalid barcode"})
    resolved = _resolve_work_order(_safe_text(barcode))
    if not resolved.get("success"):
        return _attach_backend(resolved)
    operator = _resolve_operator(operator_id=operator_id, operator_code=operator_code, operator_name=operator_name)
    if not operator:
        return _attach_backend({"success": False, "error": "operator not found"})
    return _submit_v1_work_report_item(
        work_order=resolved["row"],
        operator=operator,
        report_quantity=report_quantity,
        qualified_quantity=qualified_quantity,
        unqualified_quantity=unqualified_quantity,
        remark=remark,
    )


def simple_report_work_order(
    target: str,
    quantity: int,
    unqualified_quantity: int | None = 0,
    remark: str | None = None,
    operator_id: Any | None = None,
    operator_code: str | None = None,
    operator_name: str | None = None,
) -> Dict[str, Any]:
    """
    Minimal report API:
    - resolve target by id/orderNo/suffix/fuzzy fragment
    - auto pick process from work-order process plan
    - submit to /api/v1/work-report-items
    """
    if quantity is None or quantity < 0:
        return _attach_backend({"success": False, "error": "invalid quantity"})
    uq = int(unqualified_quantity or 0)
    if uq < 0:
        return _attach_backend({"success": False, "error": "invalid unqualified_quantity"})

    resolved = _resolve_work_order(target)
    if not resolved.get("success"):
        return _attach_backend(resolved)

    operator = _resolve_operator(
        operator_id=operator_id,
        operator_code=operator_code,
        operator_name=operator_name,
    )
    if not operator:
        return _attach_backend({"success": False, "error": "operator not found"})

    qq = quantity - uq
    if qq < 0:
        qq = 0
    return _submit_v1_work_report_item(
        work_order=resolved["row"],
        operator=operator,
        report_quantity=int(quantity),
        qualified_quantity=int(qq),
        unqualified_quantity=int(uq),
        remark=remark,
    )


def _to_iso_utc(day: datetime, end: bool = False) -> str:
    if end:
        dt = day.replace(hour=23, minute=59, second=59, microsecond=999000)
    else:
        dt = day.replace(hour=0, minute=0, second=0, microsecond=0)
    return dt.isoformat() + "Z"


def get_daily_report_stats(
    operator_id: Any,
    start_date: str | None = None,
    end_date: str | None = None,
    days: int | None = 7,
    operator_code: str | None = None,
    operator_name: str | None = None,
) -> Dict[str, Any]:
    """
    Daily quantity stats from /api/v1/work-report-items.
    """
    del operator_code, operator_name
    op_id = _safe_text(operator_id)
    if not op_id:
        return {"success": False, "error": "invalid operator_id"}

    if start_date and end_date:
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end = datetime.strptime(end_date, "%Y-%m-%d")
        except Exception:
            return {"success": False, "error": "invalid date format, expected YYYY-MM-DD"}
    else:
        span = int(days or 7)
        if span <= 0:
            span = 7
        today = datetime.now()
        end = datetime(today.year, today.month, today.day)
        start = end - timedelta(days=span - 1)

    base = _get_active_base_url()
    page = 1
    page_size = 100
    daily_sum: Dict[str, int] = {}

    while True:
        params = {
            "page": page,
            "pageSize": page_size,
            "userId": op_id,
            "startAt": _to_iso_utc(start, end=False),
            "endAt": _to_iso_utc(end, end=True),
        }
        resp = _get_json(f"{base}/api/v1/work-report-items", params=params)
        if not resp.get("success"):
            return resp
        payload = resp.get("data")
        if not isinstance(payload, dict) or payload.get("code") != 200:
            return {"success": False, "error": "invalid response from /api/v1/work-report-items"}
        data = payload.get("data")
        if not isinstance(data, dict):
            return {"success": False, "error": "invalid data shape from /api/v1/work-report-items"}
        rows = data.get("list") or []
        total = int(data.get("total") or 0)

        for row in rows:
            day_key = _safe_text(row.get("reportedAt"))[:10]
            if not day_key:
                continue
            good = int(row.get("goodQty") or 0)
            bad = int(row.get("badQty") or 0)
            daily_sum[day_key] = daily_sum.get(day_key, 0) + good + bad

        fetched = page * page_size
        if fetched >= total:
            break
        page += 1

    output: list[Dict[str, Any]] = []
    cursor = start
    while cursor <= end:
        day_key = cursor.strftime("%Y-%m-%d")
        output.append(
            {
                "date": day_key,
                "operatorId": op_id,
                "quantity": int(daily_sum.get(day_key, 0)),
            }
        )
        cursor += timedelta(days=1)

    return {"success": True, "status": 200, "data": output}


def _get_unit_rate(default: float | None = None) -> Optional[float]:
    raw = os.getenv("REPORT_UNIT_PRICE") or os.getenv("UNIT_PAY_RATE")
    if raw is None:
        return default
    try:
        return float(raw.strip())
    except Exception:
        return default


def get_today_report_and_income(
    operator_id: Any | None = None,
    unit_rate: float | None = None,
) -> Dict[str, Any]:
    """
    Summarize today's total quantity and income.
    """
    operator = _resolve_operator(operator_id=operator_id)
    if not operator:
        return {"success": False, "error": "operator not found"}

    today = datetime.now().strftime("%Y-%m-%d")
    stats = get_daily_report_stats(
        operator_id=_safe_text(operator.get("id")),
        start_date=today,
        end_date=today,
        days=None,
    )
    if not stats.get("success"):
        return stats

    rows = stats.get("data")
    quantity = 0
    if isinstance(rows, list) and rows:
        quantity = int(rows[0].get("quantity") or 0)

    rate = unit_rate if unit_rate is not None else _get_unit_rate(default=0.0)
    income = float(quantity) * float(rate or 0.0)
    return {
        "success": True,
        "status": 200,
        "data": {
            "date": today,
            "operatorId": _safe_text(operator.get("id")),
            "operatorName": _safe_text(operator.get("name")),
            "totalQuantity": quantity,
            "unitRate": float(rate or 0.0),
            "income": income,
        },
    }
