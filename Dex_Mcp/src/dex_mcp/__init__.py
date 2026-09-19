"""Agentic DEX AI layer: MCP server, live chain readers and the orchestrator agent."""

from __future__ import annotations

__all__ = ["main", "__version__"]

__version__ = "0.2.0"


def main() -> None:
    """Entry point for `uv run dex-mcp` - starts the MCP stdio server."""
    import asyncio

    from dex_mcp.MCP_Server import main as run_server

    asyncio.run(run_server())


if __name__ == "__main__":
    main()
