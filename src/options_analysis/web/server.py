"""HTTP server entry point, restricted to loopback unless explicitly configured."""

import argparse
from collections.abc import Sequence

import uvicorn


def _port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            "port must be an integer from 1 to 65535"
        ) from error
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be an integer from 1 to 65535")
    return port


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Run Option Atlas locally or on your trusted home network.",
        epilog=(
            "For a phone on the same Wi-Fi, use --host 0.0.0.0 and open your "
            "computer's LAN address. This server has no authentication; do not "
            "expose it to the public internet. See docs/MOBILE.md."
        ),
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="address to listen on (default: 127.0.0.1; use 0.0.0.0 for LAN access)",
    )
    parser.add_argument(
        "--port", type=_port, default=8000, help="TCP port, 1-65535 (default: 8000)"
    )
    args = parser.parse_args(argv)
    uvicorn.run(
        "options_analysis.web.app:app",
        host=args.host,
        port=args.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
