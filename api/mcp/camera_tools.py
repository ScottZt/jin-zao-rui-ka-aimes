"""
MCP 摄像头工具模块
=================
为“可通过 HTTP 访问的 ESP32 摄像头固件”提供统一的客户端封装，供 main_server 聚合为 MCP 工具。

默认假设设备侧提供这些 HTTP 路由：
- GET  /jpg         返回单帧 JPEG
- GET  /mjpeg       返回 MJPEG（multipart/x-mixed-replace）
- GET  /push_frames 触发设备主动推送多帧到某个接收端（例如 DCGS ingest frame_url）

其中 /push_frames 的查询参数约定（与固件一致）：
  url=<frame_url> & session_id=<id> & key=<auth_key> & frames=<n> & interval_ms=<ms>

基础地址必须显式传入 base_url/device_base_url。
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

try:
    from dotenv import load_dotenv
except Exception:
    def load_dotenv():
        return None

load_dotenv()


def _default_base_url() -> str:
    raise RuntimeError(
        "base_url is required. Provide base_url/device_base_url. Example: http://192.168.4.1"
    )


def _resolve_base_url(base_url: Optional[str]) -> Dict[str, Any]:
    if base_url and str(base_url).strip():
        return {"success": True, "base_url": str(base_url).strip().rstrip("/"), "source": "argument"}
    try:
        default_base_url = _default_base_url()
        return {"success": True, "base_url": default_base_url, "source": "argument"}
    except Exception as e:
        return {"success": False, "status": None, "error": str(e)}


def _ensure_parent_dir(path: str) -> None:
    Path(path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


def _http_get_bytes(url: str, timeout_s: float) -> Dict[str, Any]:
    try:
        req = Request(url, headers={"User-Agent": "dcgs-mcp-camera"})
        with urlopen(req, timeout=float(timeout_s)) as resp:
            data = resp.read()
            return {"success": True, "status": getattr(resp, "status", 200), "data": data}
    except HTTPError as e:
        try:
            body = e.read()
        except Exception:
            body = b""
        return {"success": False, "status": e.code, "error": (body.decode("utf-8", errors="ignore") or str(e))}
    except URLError as e:
        return {"success": False, "status": None, "error": str(getattr(e, "reason", e))}
    except Exception as e:
        return {"success": False, "status": None, "error": str(e)}


def _http_get_json(url: str, timeout_s: float) -> Dict[str, Any]:
    try:
        req = Request(url, headers={"Accept": "application/json", "User-Agent": "dcgs-mcp-camera"})
        with urlopen(req, timeout=float(timeout_s)) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = {"raw": raw}
            return {"success": True, "status": getattr(resp, "status", 200), "data": parsed}
    except HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return {"success": False, "status": e.code, "error": body or str(e)}
    except URLError as e:
        return {"success": False, "status": None, "error": str(getattr(e, "reason", e))}
    except Exception as e:
        return {"success": False, "status": None, "error": str(e)}


def take_photo(
    base_url: Optional[str] = None,
    out_path: Optional[str] = None,
    timeout_s: float = 5.0,
) -> Dict[str, Any]:
    """
    从设备侧拉取单帧 JPEG 并保存到本地文件。

    Args:
        base_url: 设备基础地址（例如 http://<设备IP>），必须显式传入
        out_path: 输出文件路径，未填则写入 outputs/camera/esp32_YYYYmmdd_HHMMSS.jpg
        timeout_s: HTTP 超时秒数

    Returns:
        dict:
          - success: bool
          - image_path: str（成功时）
          - bytes: int（成功时）
          - status/error: 失败信息
    """
    resolved = _resolve_base_url(base_url)
    if not resolved.get("success"):
        return resolved
    base = resolved["base_url"]
    url = f"{base}/jpg"
    resp = _http_get_bytes(url, timeout_s=timeout_s)
    if not resp.get("success"):
        return resp
    data: bytes = resp["data"]
    if not out_path or not str(out_path).strip():
        ts = time.strftime("%Y%m%d_%H%M%S")
        out_path = str(Path("outputs") / "camera" / f"esp32_{ts}.jpg")
    _ensure_parent_dir(out_path)
    Path(out_path).write_bytes(data)
    return {"success": True, "image_path": out_path, "bytes": len(data), "source_url": url}


def get_mjpeg_url(base_url: Optional[str] = None) -> Dict[str, Any]:
    """
    返回设备侧 MJPEG 预览流地址（仅返回 URL，不主动下载）。

    Args:
        base_url: 设备基础地址（例如 http://<设备IP>）

    Returns:
        dict: {success, mjpeg_url}
    """
    resolved = _resolve_base_url(base_url)
    if not resolved.get("success"):
        return resolved
    base = resolved["base_url"]
    return {"success": True, "mjpeg_url": f"{base}/mjpeg"}


def start_push_frames(
    device_base_url: Optional[str],
    frame_url: str,
    session_id: str,
    auth_key: str,
    frames: int = 120,
    interval_ms: int = 80,
    timeout_s: float = 5.0,
) -> Dict[str, Any]:
    """
    通过设备侧 /push_frames 触发设备主动推送多帧 JPEG 到指定 frame_url。

    Args:
        device_base_url: 设备基础地址（例如 http://<设备IP>），必须显式传入
        frame_url: 接收端帧上传地址（不含 query），例如 DCGS 返回的 frame_url
        session_id: 接收端会话 id
        auth_key: 接收端鉴权 key
        frames: 推送帧数
        interval_ms: 帧间隔（毫秒）
        timeout_s: 调用 /push_frames 的 HTTP 超时

    Returns:
        dict: {success,status,data/error, request_url}
    """
    resolved = _resolve_base_url(device_base_url)
    if not resolved.get("success"):
        return resolved
    base = resolved["base_url"]
    query = urlencode(
        {
            "url": frame_url,
            "session_id": session_id,
            "key": auth_key,
            "frames": int(frames),
            "interval_ms": int(interval_ms),
        }
    )
    request_url = f"{base}/push_frames?{query}"
    resp = _http_get_json(request_url, timeout_s=timeout_s)
    resp["request_url"] = request_url
    return resp
