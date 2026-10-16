# VS Code debugging

The checked-in `.vscode/launch.json` launches `server.py` using the Microsoft
Python Debugger extension (`debugpy`). Install the Microsoft Python extension
as well and select the project's `.venv` with **Python: Select Interpreter**.
Install `requirements.txt` into that environment before debugging.

Choose **Signal Lab: Python server** in Run and Debug, then press **F5**.
The server runs in the integrated terminal with the repository as its working
directory and listens on `127.0.0.1:8000`. VS Code automatically opens
<http://localhost:8000/playground/> in your default browser when it detects the
server's printed URL. Output is also copied to the Debug Console so that
`serverReadyAction` can detect it. Download stock data using the README
instructions to populate the charts. Market refresh requests require internet
access; starting the server does not download data automatically.

Set Python breakpoints in `server.py` or `download_sp500.py`, then trigger a
market refresh in the browser to inspect request handling. **Shift+F5** stops
the debug session. This configuration debugs Python; browser JavaScript can be
inspected using the browser's developer tools.

If port 8000 is occupied, stop the other server or change the `--port` argument
in `launch.json`; the browser action picks up the port from the printed URL.
The launch uses VS
Code's selected Python interpreter, so there is no platform-specific interpreter
path to edit.

## Alternatives and tradeoffs

- **Direct launch (configured):** F5 starts and stops the server and supports
  Python breakpoints. It starts a separate process, so an existing server on the
  same port must be stopped first.
- **Attach to an existing process:** preserves a separately managed server's
  startup workflow, but requires starting it with debugpy and configuring an
  attach session. It is not configured here.
- **Browser debugging session:** adds JavaScript breakpoints in VS Code but
  requires a supported browser and an additional debug configuration. The
  configured default-browser action works with your preferred browser; use its
  developer tools for JavaScript debugging.
- **Plain static server:** `python -m http.server 8000` is sufficient for viewing
  downloaded charts, but does not support the market refresh API or its Python
  request breakpoints.
