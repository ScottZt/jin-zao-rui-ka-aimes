"""
mcp_pipe 模块

功能说明:
    - 通过 WebSocket 将 MCP 标准输入输出 与 远端服务进行管道转发
    - 支持从统一 JSON 配置启动多个本地 MCP Server 子进程
    - 支持子进程 stdout/stderr 与 WebSocket 之间的双向转发
    - 内置自动重连与指数退避机制，保证服务长时间稳定运行

版本:
    0.2.0

环境变量用法:
    - 设置 WebSocket 端点地址:
        Linux / macOS:
            export MCP_ENDPOINT=<ws_endpoint>
        Windows (PowerShell):
            $env:MCP_ENDPOINT = "<ws_endpoint>"

启动方式:
    1. 从配置文件启动所有已配置的服务器(默认):
        python mcp_pipe.py

    2. 启动单个本地 Python 服务器脚本(向后兼容模式):
        python mcp_pipe.py path/to/server.py

配置文件发现顺序:
    1. 环境变量: $MCP_CONFIG
    2. 当前工作目录下: ./mcp_config.json

代理环境变量:
    - 对于 HTTP/SSE 类型的后端，统一使用当前 Python 运行 mcp_proxy 模块:
        python -m mcp_proxy
"""

import asyncio
import websockets
import subprocess
import logging
import os
import signal
import sys
import json
from dotenv import load_dotenv

# 如果存在 .env 文件，则自动从 .env 文件加载环境变量
load_dotenv()

# 配置基础日志格式，统一由 MCP_PIPE logger 输出
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('MCP_PIPE')

# 重连设置: 初始重试间隔与最大退避时间(单位: 秒)
INITIAL_BACKOFF = 1  # 初始重试等待时间(秒)
MAX_BACKOFF = 600  # 最大退避等待时间(秒)


async def connect_with_retry(uri, target):
    """
    使用重试机制连接指定目标的 WebSocket 服务器。

    参数:
        uri: WebSocket 网关基础地址(不带 name 参数)
        target: 目标服务名称，用于区分不同的子进程与日志前缀

    行为:
        - 在连接失败或中断时，按照指数退避策略自动重连
        - 采用无限重试，确保在进程生命周期内尽可能保持连接可用
    """
    reconnect_attempt = 0
    backoff = INITIAL_BACKOFF
    while True:  # 使用无限循环保证进程在生命周期内持续尝试重连
        try:
            if reconnect_attempt > 0:
                logger.info(f"[{target}] Waiting {backoff}s before reconnection attempt {reconnect_attempt}...")
                await asyncio.sleep(backoff)

            # 尝试建立连接，并在 URL 中附加 target 名称，用于区分不同连接
            if '?' in uri:
                connect_uri = f"{uri}&name={target}"
            else:
                connect_uri = f"{uri}?name={target}"
            
            await connect_to_server(connect_uri, target)

        except Exception as e:
            reconnect_attempt += 1
            logger.warning(f"[{target}] Connection closed (attempt {reconnect_attempt}): {e}")
            # Calculate wait time for next reconnection (exponential backoff)
            backoff = min(backoff * 2, MAX_BACKOFF)

async def connect_to_server(uri, target):
    """
    建立到 WebSocket 服务器的连接，并为指定目标创建本地子进程。

    参数:
        uri: 带有 name 参数的 WebSocket 连接地址
        target: 目标服务名称或脚本路径(用于构建子进程启动命令)

    行为:
        - 通过 build_server_command 构建子进程启动命令及环境变量
        - 启动子进程并创建三条异步管道:
            1. WebSocket -> 子进程 stdin
            2. 子进程 stdout -> WebSocket
            3. 子进程 stderr -> 本地终端(stderr)
        - 在 WebSocket 连接关闭或异常时，确保子进程被正确终止
    """
    try:
        logger.info(f"[{target}] Connecting to WebSocket server...")
        async with websockets.connect(uri) as websocket:
            logger.info(f"[{target}] Successfully connected to WebSocket server")

            # 根据命令行参数或配置文件构建并启动服务子进程
            cmd, env = build_server_command(target)
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                encoding='utf-8',
                text=True,
                env=env
            )
            logger.info(f"[{target}] Started server process: {' '.join(cmd)}")

            # 创建三条异步任务:
            # 1. WebSocket -> 子进程 stdin
            # 2. 子进程 stdout -> WebSocket
            # 3. 子进程 stderr -> 本地终端
            await asyncio.gather(
                pipe_websocket_to_process(websocket, process, target),
                pipe_process_to_websocket(process, websocket, target),
                pipe_process_stderr_to_terminal(process, target)
            )
    except websockets.exceptions.ConnectionClosed as e:
        logger.error(f"[{target}] WebSocket connection closed: {e}")
        raise  # Re-throw exception to trigger reconnection
    except Exception as e:
        logger.error(f"[{target}] Connection error: {e}")
        raise  # Re-throw exception
    finally:
        # 确保 WebSocket 连接结束后，子进程能够被正确终止
        if 'process' in locals():
            logger.info(f"[{target}] Terminating server process")
            try:
                process.terminate()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            logger.info(f"[{target}] Server process terminated")

async def pipe_websocket_to_process(websocket, process, target):
    """
    将 WebSocket 收到的数据写入子进程 stdin。

    参数:
        websocket: WebSocket 连接对象
        process: 已启动的子进程对象
        target: 目标服务名称，用于日志输出前缀
    """
    try:
        while True:
            # 从 WebSocket 读取一条消息(文本或二进制)
            message = await websocket.recv()
            logger.debug(f"[{target}] << {message[:120]}...")
            
            # 将消息以文本形式写入子进程 stdin，保持一行一条 JSON 消息
            if isinstance(message, bytes):
                message = message.decode('utf-8')
            process.stdin.write(message + '\n')
            process.stdin.flush()
    except Exception as e:
        logger.error(f"[{target}] Error in WebSocket to process pipe: {e}")
        raise  # Re-throw exception to trigger reconnection
    finally:
        # 出现异常或退出循环时关闭子进程 stdin，通知子进程不再有输入
        if not process.stdin.closed:
            process.stdin.close()

async def pipe_process_to_websocket(process, websocket, target):
    """
    读取子进程 stdout，并将数据发送到 WebSocket。

    参数:
        process: 已启动的子进程对象
        websocket: WebSocket 连接对象
        target: 目标服务名称，用于日志输出前缀
    """
    try:
        while True:
            # 使用线程池方式非阻塞读取子进程 stdout 的一行数据
            data = await asyncio.to_thread(process.stdout.readline)
            
            if not data:  # 如果读取不到数据，说明子进程可能已经退出
                logger.info(f"[{target}] Process has ended output")
                break
                
            # 将子进程输出的单行文本发送到 WebSocket
            logger.debug(f"[{target}] >> {data[:120]}...")
            # In text mode, data is already a string, no need to decode
            await websocket.send(data)
    except Exception as e:
        logger.error(f"[{target}] Error in process to WebSocket pipe: {e}")
        raise  # Re-throw exception to trigger reconnection

async def pipe_process_stderr_to_terminal(process, target):
    """
    读取子进程 stderr，并将其原样输出到本地终端。

    参数:
        process: 已启动的子进程对象
        target: 目标服务名称，用于日志输出前缀
    """
    try:
        while True:
            # 使用线程池方式非阻塞读取子进程 stderr 的一行数据
            data = await asyncio.to_thread(process.stderr.readline)
            
            if not data:  # 如果读取不到数据，说明子进程可能已经退出
                logger.info(f"[{target}] Process has ended stderr output")
                break
                
            # 直接将错误输出写入本地终端的 stderr，方便调试与排错
            sys.stderr.write(data)
            sys.stderr.flush()
    except Exception as e:
        logger.error(f"[{target}] Error in process stderr pipe: {e}")
        raise  # Re-throw exception to trigger reconnection

def signal_handler(sig, frame):
    """
    处理中断信号(SIGINT)的回调函数。

    作用:
        - 捕获 Ctrl+C 中断信号
        - 输出友好日志并优雅退出当前进程
    """
    logger.info("Received interrupt signal, shutting down...")
    sys.exit(0)

def load_config():
    """
    加载 MCP JSON 配置文件。

    配置来源优先级:
        1. 环境变量 MCP_CONFIG 指定的路径
        2. 当前工作目录下的 mcp_config.json

    返回:
        - 解析成功时返回配置字典
        - 文件不存在或解析失败时返回空字典 {}
    """
    path = os.environ.get("MCP_CONFIG") or os.path.join(os.getcwd(), "mcp_config.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        # 配置解析失败时仅记录警告日志，不中断主流程
        logger.warning(f"Failed to load config {path}: {e}")
        return {}


def build_server_command(target=None):
    """
    为指定目标构建子进程启动命令以及环境变量。

    优先级:
        1. 如果 target 对应配置文件中的 mcpServers 条目，则优先使用配置:
            - 支持 stdio / sse / http / streamablehttp 等多种类型
        2. 否则将 target 视为本地 Python 脚本路径(向后兼容模式)

    参数:
        target: 目标服务名称或脚本路径; 为 None 时从 sys.argv[1] 读取

    返回:
        (cmd_list, child_env):
            - cmd_list: 用于 subprocess.Popen 的命令及参数列表
            - child_env: 子进程环境变量字典
    """
    if target is None:
        # 未显式传入 target 时，默认从命令行参数中读取
        assert len(sys.argv) >= 2, "missing server name or script path"
        target = sys.argv[1]
    cfg = load_config()
    # 从配置中获取 mcpServers 节点，确保类型为字典
    servers = cfg.get("mcpServers", {}) if isinstance(cfg, dict) else {}

    if target in servers:
        entry = servers[target] or {}  # 单个服务配置条目
        if entry.get("disabled"):
            raise RuntimeError(f"Server '{target}' is disabled in config")
        typ = (entry.get("type") or entry.get("transportType") or "stdio").lower()

        # 构建子进程所需的环境变量，基于当前环境并叠加配置的 env
        child_env = os.environ.copy()
        for k, v in (entry.get("env") or {}).items():
            child_env[str(k)] = str(v)

        if typ == "stdio":
            command = entry.get("command")
            args = entry.get("args") or []
            if not command:
                # stdio 类型必须提供 command 字段，否则认为配置不完整
                raise RuntimeError(f"Server '{target}' is missing 'command'")
            return [command, *args], child_env

        if typ in ("sse", "http", "streamablehttp"):
            url = entry.get("url")
            if not url:
                # SSE/HTTP 类后端必须提供 url 字段
                raise RuntimeError(f"Server '{target}' (type {typ}) is missing 'url'")
            # 统一通过当前 Python 解释器运行 mcp_proxy 模块，避免环境不一致
            cmd = [sys.executable, "-m", "mcp_proxy"]
            if typ in ("http", "streamablehttp"):
                cmd += ["--transport", "streamablehttp"]
            # 可选 headers 配置，例如: {"Authorization": "Bearer xxx"}
            headers = entry.get("headers") or {}
            for hk, hv in headers.items():
                cmd += ["-H", hk, str(hv)]
            cmd.append(url)
            return cmd, child_env

        raise RuntimeError(f"Unsupported server type: {typ}")

    # 回退逻辑: 将 target 视为本地 Python 脚本路径(向后兼容模式)
    script_path = target
    if not os.path.exists(script_path):
        # 既不是配置中的服务名称，也不是本地脚本路径时，给出明确错误提示
        raise RuntimeError(
            f"'{target}' is neither a configured server nor an existing script"
        )
    return [sys.executable, script_path], os.environ.copy()

if __name__ == "__main__":
    # 注册 SIGINT 信号处理器，支持 Ctrl+C 友好退出
    signal.signal(signal.SIGINT, signal_handler)
    
    # 从环境变量中读取 WebSocket 端点地址
    endpoint_url = os.environ.get('MCP_ENDPOINT')
    if not endpoint_url:
        logger.error("Please set the `MCP_ENDPOINT` environment variable")
        sys.exit(1)
    
    # 判断是否存在命令行参数:
    # - 无参数: 从配置文件启动所有启用的 mcpServers
    # - 有参数: 将参数视为本地 Python 脚本路径(兼容旧用法)
    target_arg = sys.argv[1] if len(sys.argv) >= 2 else None

    async def _main():
        """
        程序主入口的异步封装函数。

        行为:
            - 无命令行参数时: 读取配置文件并并行启动所有启用的服务器
            - 带命令行参数时: 将参数视为本地脚本路径，仅启动该脚本
        """
        if not target_arg:
            cfg = load_config()
            servers_cfg = (cfg.get("mcpServers") or {})
            all_servers = list(servers_cfg.keys())
            # 过滤出未被标记为 disabled 的服务作为启用列表
            enabled = [name for name, entry in servers_cfg.items() if not (entry or {}).get("disabled")]
            skipped = [name for name in all_servers if name not in enabled]
            if skipped:
                # 打印被跳过(禁用状态)的服务名称，便于运维排查
                logger.info(f"Skipping disabled servers: {', '.join(skipped)}")
            if not enabled:
                raise RuntimeError("No enabled mcpServers found in config")
            logger.info(f"Starting servers: {', '.join(enabled)}")
            tasks = []
            for t in enabled:
                tasks.append(asyncio.create_task(connect_with_retry(endpoint_url, t)))
                # 在多个服务间加入稍微的延迟，避免同时建连给服务端带来瞬时压力
                await asyncio.sleep(0.5)

            # 聚合所有任务，任何单个任务内部异常均会触发其自带的重连逻辑
            await asyncio.gather(*tasks)
        else:
            if os.path.exists(target_arg):
                await connect_with_retry(endpoint_url, target_arg)
            else:
                logger.error("Argument must be a local Python script path. To run configured servers, run without arguments.")
                sys.exit(1)

    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        logger.info("Program interrupted by user")
    except Exception as e:
        logger.error(f"Program execution error: {e}")
