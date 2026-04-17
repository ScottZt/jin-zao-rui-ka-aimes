# server.py
from fastmcp import FastMCP
import sys
import logging
import math
import random

logger = logging.getLogger('Calculator')

# Fix UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stderr.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')

# 提取核心逻辑为独立函数，方便复用
def calculate_expression(python_expression: str) -> dict:
    """For mathamatical calculation, always use this tool to calculate the result of a python expression. You can use 'math' or 'random' directly, without 'import'."""
    try:
        result = eval(python_expression, {"math": math, "random": random})
        logger.info(f"Calculating formula: {python_expression}, result: {result}")
        return {"success": True, "result": result}
    except Exception as e:
        logger.error(f"Calculation error: {e}")
        return {"success": False, "error": str(e)}

# Create an MCP server
mcp = FastMCP("Calculator")

@mcp.tool()
def calculator(python_expression: str) -> dict:
    """For mathamatical calculation, always use this tool to calculate the result of a python expression. You can use 'math' or 'random' directly, without 'import'."""
    return calculate_expression(python_expression)

# Start the server
if __name__ == "__main__":
    mcp.run(transport="stdio")
