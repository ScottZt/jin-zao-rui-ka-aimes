from fastmcp import FastMCP
import sys
import logging
from typing import Any

# Import tool functions from modules
from calculator import calculate_expression
from system_info import collect_system_stats, collect_process_list, collect_gpu_info
from production_reporting import report_work_order_by_id, scan_report_work_order, simple_report_work_order, get_daily_report_stats, get_today_report_and_income
from camera_tools import take_photo, get_mjpeg_url, start_push_frames

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('MainServer')

# Fix UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stderr.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')

# Create a single aggregated MCP server
# This solves the issue of WebSocket connection conflicts by exposing all tools via a single connection
mcp = FastMCP("AllTools")

# --- Register Calculator Tools ---
@mcp.tool(name="calculator")
def calculator(python_expression: str) -> dict:
    """For mathamatical calculation, always use this tool to calculate the result of a python expression. You can use 'math' or 'random' directly, without 'import'."""
    return calculate_expression(python_expression)

# --- Register System Info Tools ---
@mcp.tool(name="get_system_stats")
def get_system_stats() -> dict:
    """Get current system statistics including CPU, Memory, and Disk usage."""
    return collect_system_stats()

@mcp.tool(name="get_process_list")
def get_process_list(limit: int = 5) -> dict:
    """Get list of top resource-consuming processes.
    
    Args:
        limit: Number of processes to return (default: 5)
    """
    return collect_process_list(limit)

@mcp.tool(name="get_gpu_info")
def get_gpu_info() -> dict:
    """Get GPU information including model, memory, and usage (if available)."""
    return collect_gpu_info()

# --- Register Production Reporting Tools ---
@mcp.tool(name="report_work_order")
def mcp_report_work_order(
    target: Any | None = None,
    work_order_id: Any | None = None,
    report_quantity: int = 0,
    unqualified_quantity: int = 0,
    remark: str | None = None,
    operator_id: int | None = None,
    operator_code: str | None = None,
    operator_name: str | None = None,
) -> dict:
    """Submit a work-order report with minimal parameters.

    Supports:
    - exact work-order id,
    - work-order target text (full code, suffix, fuzzy fragment, barcode).
    """
    # Some LLM clients may incorrectly wrap params as:
    # {"target": {"work_order_id": "...", "report_quantity": 33}}
    # Normalize here to avoid schema-validation induced failures.
    if isinstance(target, dict):
        nested = target
        nested_target = nested.get("target")
        nested_work_order = nested.get("work_order_id")

        if work_order_id is None and nested_work_order is not None:
            work_order_id = nested_work_order
        if nested_target is not None:
            target = nested_target
        elif nested_work_order is not None:
            target = nested_work_order
        else:
            target = None

        if "report_quantity" in nested and report_quantity == 0:
            try:
                report_quantity = int(nested.get("report_quantity"))
            except Exception:
                pass
        if "unqualified_quantity" in nested and unqualified_quantity == 0:
            try:
                unqualified_quantity = int(nested.get("unqualified_quantity"))
            except Exception:
                pass
        if remark is None and nested.get("remark") is not None:
            remark = str(nested.get("remark"))
        if operator_id is None and nested.get("operator_id") is not None:
            operator_id = nested.get("operator_id")
        if operator_code is None and nested.get("operator_code") is not None:
            operator_code = str(nested.get("operator_code"))
        if operator_name is None and nested.get("operator_name") is not None:
            operator_name = str(nested.get("operator_name"))

    if target is None:
        if work_order_id is None:
            return {
                "success": False,
                "error": "invalid target or work_order_id",
                "normalizedInput": {
                    "target": None,
                    "work_order_id": work_order_id,
                    "report_quantity": report_quantity,
                    "unqualified_quantity": unqualified_quantity,
                },
            }
        target = str(work_order_id).strip()
        if not target:
            return {
                "success": False,
                "error": "invalid target or work_order_id",
                "normalizedInput": {
                    "target": target,
                    "work_order_id": work_order_id,
                    "report_quantity": report_quantity,
                    "unqualified_quantity": unqualified_quantity,
                },
            }
    else:
        target = str(target).strip()
        if not target:
            return {
                "success": False,
                "error": "invalid target",
                "normalizedInput": {
                    "target": target,
                    "work_order_id": work_order_id,
                    "report_quantity": report_quantity,
                    "unqualified_quantity": unqualified_quantity,
                },
            }
    if report_quantity < 0:
        return {
            "success": False,
            "error": "invalid report_quantity",
            "normalizedInput": {
                "target": target,
                "work_order_id": work_order_id,
                "report_quantity": report_quantity,
                "unqualified_quantity": unqualified_quantity,
            },
        }
    if unqualified_quantity < 0:
        return {
            "success": False,
            "error": "invalid unqualified_quantity",
            "normalizedInput": {
                "target": target,
                "work_order_id": work_order_id,
                "report_quantity": report_quantity,
                "unqualified_quantity": unqualified_quantity,
            },
        }

    normalized_input = {
        "target": target,
        "work_order_id": work_order_id,
        "report_quantity": report_quantity,
        "unqualified_quantity": unqualified_quantity,
        "remark": remark,
        "operator_id": operator_id,
        "operator_code": operator_code,
        "operator_name": operator_name,
    }

    result = simple_report_work_order(
        target=target,
        quantity=report_quantity,
        unqualified_quantity=unqualified_quantity,
        remark=remark,
        operator_id=operator_id,
        operator_code=operator_code,
        operator_name=operator_name,
    )
    if isinstance(result, dict):
        result["normalizedInput"] = normalized_input
    return result

@mcp.tool(name="report_work_order_full")
def mcp_report_work_order_full(
    work_order_id: int,
    operator_id: int,
    operator_code: str,
    operator_name: str,
    report_quantity: int,
    unqualified_quantity: int = 0,
    qualified_quantity: int | None = None,
    work_time: int | None = None,
    remark: str | None = None,
) -> dict:
    """Submit a work-order report with full parameters."""
    if work_order_id <= 0:
        return {"success": False, "error": "invalid work_order_id"}
    if operator_id <= 0:
        return {"success": False, "error": "invalid operator_id"}
    if report_quantity < 0 or unqualified_quantity < 0:
        return {"success": False, "error": "invalid quantity values"}
    if qualified_quantity is None:
        qualified_quantity = report_quantity - unqualified_quantity
    if qualified_quantity < 0:
        return {"success": False, "error": "invalid qualified_quantity"}
    if work_time is not None and work_time < 0:
        return {"success": False, "error": "invalid work_time"}
    return report_work_order_by_id(
        work_order_id=work_order_id,
        operator_id=operator_id,
        operator_code=operator_code,
        operator_name=operator_name,
        report_quantity=report_quantity,
        qualified_quantity=qualified_quantity,
        unqualified_quantity=unqualified_quantity,
        work_time=work_time,
        remark=remark,
    )

@mcp.tool(name="scan_report_work_order")
def mcp_scan_report_work_order(
    barcode: str,
    operator_id: int,
    operator_code: str,
    operator_name: str,
    report_quantity: int,
    unqualified_quantity: int = 0,
    qualified_quantity: int | None = None,
    work_time: int | None = None,
    remark: str | None = None,
) -> dict:
    """Submit a report by barcode."""
    if not barcode or not barcode.strip():
        return {"success": False, "error": "invalid barcode"}
    if operator_id <= 0:
        return {"success": False, "error": "invalid operator_id"}
    if report_quantity < 0 or unqualified_quantity < 0:
        return {"success": False, "error": "invalid quantity values"}
    if qualified_quantity is None:
        qualified_quantity = report_quantity - unqualified_quantity
    if qualified_quantity < 0:
        return {"success": False, "error": "invalid qualified_quantity"}
    if work_time is not None and work_time < 0:
        return {"success": False, "error": "invalid work_time"}
    return scan_report_work_order(
        barcode=barcode.strip(),
        operator_id=operator_id,
        operator_code=operator_code,
        operator_name=operator_name,
        report_quantity=report_quantity,
        qualified_quantity=qualified_quantity,
        unqualified_quantity=unqualified_quantity,
        work_time=work_time,
        remark=remark,
    )


@mcp.tool(name="daily_report_stats")
def mcp_daily_report_stats(
    operator_id: int,
    start_date: str | None = None,
    end_date: str | None = None,
    days: int | None = 7,
) -> dict:
    """Get daily report quantities for a given operator."""
    return get_daily_report_stats(
        operator_id=operator_id,
        start_date=start_date,
        end_date=end_date,
        days=days,
    )

@mcp.tool(name="today_report_income")
def mcp_today_report_income(
    operator_id: int | None = None,
    unit_rate: float | None = None,
) -> dict:
    """Summarize today's report quantity and income for the operator."""
    return get_today_report_and_income(
        operator_id=operator_id,
        unit_rate=unit_rate,
    )

# # --- Register Camera Tools ---
# @mcp.tool(name="摄像头拍照")
# def mcp_camera_take_photo(
#     base_url: str | None = None,
#     out_path: str | None = None,
#     timeout_s: float = 5.0,
# ) -> dict:
#     """从 ESP32 摄像头固件拉取单帧 JPEG 并保存到本地文件。"""
#     return take_photo(base_url=base_url, out_path=out_path, timeout_s=timeout_s)

# @mcp.tool(name="摄像头预览地址")
# def mcp_camera_get_mjpeg_url(base_url: str | None = None) -> dict:
#     """返回 ESP32 摄像头的 MJPEG 预览流地址（URL）。"""
#     return get_mjpeg_url(base_url=base_url)

# @mcp.tool(name="摄像头推送多帧")
# def mcp_camera_start_push_frames(
#     device_base_url: str | None,
#     frame_url: str,
#     session_id: str,
#     auth_key: str,
#     frames: int = 120,
#     interval_ms: int = 80,
#     timeout_s: float = 5.0,
# ) -> dict:
#     """触发 ESP32 摄像头固件通过 /push_frames 推送多帧 JPEG 到接收端。"""
#     return start_push_frames(
#         device_base_url=device_base_url,
#         frame_url=frame_url,
#         session_id=session_id,
#         auth_key=auth_key,
#         frames=frames,
#         interval_ms=interval_ms,
#         timeout_s=timeout_s,
#     )
if __name__ == "__main__":
    logger.info("Starting aggregated MCP server with all tools...")
    mcp.run(transport="stdio")
