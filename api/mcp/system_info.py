from fastmcp import FastMCP
import sys
import logging
import psutil
import platform
import subprocess
import shutil
import csv
import io
from datetime import datetime

# Configure logging
logger = logging.getLogger('SystemInfo')

# Fix UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stderr.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')

# 提取逻辑
def collect_system_stats() -> dict:
    """Get current system statistics including CPU, Memory, and Disk usage."""
    try:
        # CPU usage
        cpu_percent = psutil.cpu_percent(interval=1)
        
        # Memory usage
        memory = psutil.virtual_memory()
        memory_stats = {
            "total_gb": round(memory.total / (1024**3), 2),
            "available_gb": round(memory.available / (1024**3), 2),
            "percent": memory.percent
        }
        
        # Disk usage
        disk = psutil.disk_usage('/')
        disk_stats = {
            "total_gb": round(disk.total / (1024**3), 2),
            "free_gb": round(disk.free / (1024**3), 2),
            "percent": disk.percent
        }

        # System info
        sys_info = {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "timestamp": datetime.now().isoformat()
        }

        result = {
            "cpu_percent": cpu_percent,
            "memory": memory_stats,
            "disk": disk_stats,
            "os": sys_info
        }
        
        logger.info(f"Collected system stats: {result}")
        return {"success": True, "data": result}
        
    except Exception as e:
        error_msg = f"Failed to collect system stats: {str(e)}"
        logger.error(error_msg)
        return {"success": False, "error": error_msg}

def collect_process_list(limit: int = 5) -> dict:
    """Get list of top resource-consuming processes."""
    try:
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            try:
                pinfo = proc.info
                processes.append(pinfo)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
        
        # Sort by CPU usage
        processes.sort(key=lambda x: x.get('cpu_percent', 0), reverse=True)
        top_processes = processes[:limit]
        
        return {"success": True, "processes": top_processes}
    except Exception as e:
        logger.error(f"Failed to get process list: {e}")
        return {"success": False, "error": str(e)}

def collect_gpu_info() -> dict:
    """Get GPU information including model, memory, and usage (if available)."""
    try:
        gpus = []
        
        # Method 1: Try nvidia-smi (Best for NVIDIA GPUs)
        if shutil.which('nvidia-smi'):
            try:
                # Query specific fields: Name, Total Memory, Free Memory, Used Memory, Utilization, Temperature
                cmd = ['nvidia-smi', '--query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu,temperature.gpu', '--format=csv,nounits,noheader']
                output = subprocess.check_output(cmd, encoding='utf-8')
                
                reader = csv.reader(io.StringIO(output))
                for row in reader:
                    if len(row) >= 6:
                        gpus.append({
                            "name": row[0].strip(),
                            "memory_total_mb": float(row[1].strip()),
                            "memory_free_mb": float(row[2].strip()),
                            "memory_used_mb": float(row[3].strip()),
                            "utilization_percent": float(row[4].strip()),
                            "temperature_c": float(row[5].strip()),
                            "source": "nvidia-smi"
                        })
                if gpus:
                    return {"success": True, "gpus": gpus}
            except Exception as e:
                logger.warning(f"nvidia-smi found but failed to query: {e}")

        # Method 2: Fallback to WMIC (Windows only, generic)
        if sys.platform == 'win32':
            try:
                cmd = 'wmic path win32_VideoController get Name,AdapterRAM'
                output = subprocess.check_output(cmd, shell=True, encoding='utf-8').strip().split('\n')
                # Skip header
                if len(output) > 1:
                    for line in output[1:]:
                        parts = line.strip().rsplit('  ', 1) # Try to split by double space
                        if len(parts) >= 1 and parts[0].strip():
                            name = parts[0].strip()
                            # AdapterRAM is often reported incorrectly by WMIC (bytes), but let's try
                            # Often it's just the name that is reliable
                            gpus.append({
                                "name": name,
                                "source": "wmic"
                            })
            except Exception as e:
                logger.warning(f"wmic failed: {e}")

        if not gpus:
            return {"success": False, "error": "No GPU information found"}
            
        return {"success": True, "gpus": gpus}

    except Exception as e:
        logger.error(f"Failed to collect GPU info: {e}")
        return {"success": False, "error": str(e)}

# Create an MCP server
mcp = FastMCP("SystemInfo")

@mcp.tool()
def get_system_stats() -> dict:
    """Get current system statistics including CPU, Memory, and Disk usage."""
    return collect_system_stats()

@mcp.tool()
def get_process_list(limit: int = 5) -> dict:
    """Get list of top resource-consuming processes.
    
    Args:
        limit: Number of processes to return (default: 5)
    """
    return collect_process_list(limit)

@mcp.tool()
def get_gpu_info() -> dict:
    """Get GPU information including model, memory, and usage (if available)."""
    return collect_gpu_info()

if __name__ == "__main__":
    mcp.run(transport="stdio")
