from unittest.mock import patch

import pytest

from options_analysis.web.server import main


def test_server_defaults_to_loopback() -> None:
    with patch("options_analysis.web.server.uvicorn.run") as run:
        main([])
    run.assert_called_once_with(
        "options_analysis.web.app:app", host="127.0.0.1", port=8000, reload=False
    )


def test_lan_binding_requires_an_explicit_host_argument() -> None:
    with patch("options_analysis.web.server.uvicorn.run") as run:
        main(["--host", "0.0.0.0", "--port", "8080"])
    run.assert_called_once_with(
        "options_analysis.web.app:app", host="0.0.0.0", port=8080, reload=False
    )


@pytest.mark.parametrize("port", ["0", "-1", "65536", "8000.5", "http"])
def test_invalid_port_does_not_start_server(
    port: str, capsys: pytest.CaptureFixture[str]
) -> None:
    with (
        patch("options_analysis.web.server.uvicorn.run") as run,
        pytest.raises(SystemExit) as error,
    ):
        main(["--port", port])
    assert error.value.code == 2
    assert "port must be an integer from 1 to 65535" in capsys.readouterr().err
    run.assert_not_called()


def test_server_help_describes_phone_access_and_stops(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with (
        patch("options_analysis.web.server.uvicorn.run") as run,
        pytest.raises(SystemExit) as error,
    ):
        main(["--help"])
    assert error.value.code == 0
    assert "--host 0.0.0.0" in capsys.readouterr().out
    run.assert_not_called()
