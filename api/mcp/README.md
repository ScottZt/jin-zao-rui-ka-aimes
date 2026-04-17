# MCP Sample Project | MCP 示例项目

A powerful interface for extending AI capabilities through remote control, calculations, email operations, knowledge search, and more.

一个强大的接口，用于通过远程控制、计算、邮件操作、知识搜索等方式扩展AI能力。

## Overview | 概述

MCP (Model Context Protocol) is a protocol that allows servers to expose tools that can be invoked by language models. Tools enable models to interact with external systems, such as querying databases, calling APIs, or performing computations. Each tool is uniquely identified by a name and includes metadata describing its schema.

MCP（模型上下文协议）是一个允许服务器向语言模型暴露可调用工具的协议。这些工具使模型能够与外部系统交互，例如查询数据库、调用API或执行计算。每个工具都由一个唯一的名称标识，并包含描述其模式的元数据。

## Features | 特性

- 🔌 Bidirectional communication between AI and external tools | AI与外部工具之间的双向通信
- 🔄 Automatic reconnection with exponential backoff | 具有指数退避的自动重连机制
- 📊 Real-time data streaming | 实时数据流传输
- 🛠️ Easy-to-use tool creation interface | 简单易用的工具创建接口
- 🔒 Secure WebSocket communication | 安全的WebSocket通信
- ⚙️ Multiple transport types support (stdio/sse/http) | 支持多种传输类型（stdio/sse/http）

## Quick Start | 快速开始

conda remove -n mcp-calculator --all -y
conda create -n mcp-calculator python=3.10 -y
conda activate mcp-calculator

1. Install dependencies | 安装依赖:
```bash
pip install -r requirements.txt
```

2. Set up environment variables | 设置环境变量:
*Create a `.env` file in the project root with the following content:*
```properties
MCP_ENDPOINT=<your_mcp_endpoint>
```

3. Run the aggregated server | 运行聚合服务:
```bash
python mcp_pipe.py
```

*This will start `main_server.py`, which aggregates all configured tools (Calculator, SystemInfo, etc.) into a single MCP connection.*

*这将启动 `main_server.py`，它将所有配置的工具（计算器、系统信息等）聚合到一个单一的 MCP 连接中。*

## Project Structure | 项目结构

- `mcp_pipe.py`: Main communication pipe that handles WebSocket connections and process management | 处理WebSocket连接和进程管理的主通信管道
- `main_server.py`: Aggregated MCP server that exposes all tools via a single connection | 通过单一连接暴露所有工具的聚合MCP服务器
- `calculator.py`: Mathematical calculation logic | 数学计算逻辑
- `system_info.py`: System monitoring logic (CPU/Memory/Processes) | 系统监控逻辑（CPU/内存/进程）
- `requirements.txt`: Project dependencies | 项目依赖
- `mcp_config.json`: Configuration file for server definitions | 服务器定义配置文件

## Architecture | 架构说明

This project uses an **Aggregation Pattern** to expose multiple tools via a single WebSocket connection. This ensures compatibility with MCP Endpoint Servers that limit one active session per token.

本项目采用 **聚合模式 (Aggregation Pattern)**，通过单一 WebSocket 连接暴露多个工具。这确保了与限制每个 Token 只能有一个活跃会话的 MCP Endpoint Server 的兼容性。

### Adding New Tools | 添加新工具

1. Create a new module (e.g., `my_tool.py`) with your logic functions.
2. Import your functions in `main_server.py`.
3. Register them using `@mcp.tool()` decorator in `main_server.py`.
4. Restart `mcp_pipe.py`.

1. 创建包含逻辑函数的新模块（例如 `my_tool.py`）。
2. 在 `main_server.py` 中导入您的函数。
3. 在 `main_server.py` 中使用 `@mcp.tool()` 装饰器注册它们。
4. 重启 `mcp_pipe.py`。

## Config-driven Servers | 通过配置驱动的服务

Edit `mcp_config.json` to configure the server list. By default, it points to `main_server.py`.

编辑 `mcp_config.json` 文件来配置服务器列表。默认情况下，它指向 `main_server.py`。

## Use Cases | 使用场景

- Mathematical calculations | 数学计算
- System Monitoring (CPU/Memory) | 系统监控（CPU/内存）
- Email operations | 邮件操作
- Knowledge base search | 知识库搜索
- Remote device control | 远程设备控制
- Data processing | 数据处理
- Custom tool integration | 自定义工具集成

## Requirements | 环境要求

- Python 3.7+
- websockets>=11.0.3
- python-dotenv>=1.0.0
- mcp>=1.8.1
- pydantic>=2.11.4
- mcp-proxy>=0.8.2
- psutil>=7.0.0

## Contributing | 贡献指南

Contributions are welcome! Please feel free to submit a Pull Request.

欢迎贡献代码！请随时提交Pull Request。

## License | 许可证

This project is licensed under the MIT License - see the LICENSE file for details.

本项目采用MIT许可证 - 详情请查看LICENSE文件。

## Acknowledgments | 致谢

- Thanks to all contributors who have helped shape this project | 感谢所有帮助塑造这个项目的贡献者
- Inspired by the need for extensible AI capabilities | 灵感来源于对可扩展AI能力的需求
