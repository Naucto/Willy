from controller import Controller

from flask import Flask
from gevent.pywsgi import WSGIServer
from gevent import ssl
from loguru import logger as L

import traceback
import threading
from typing import Optional


class WebhookListener:
    def __init__(self, controller: Controller, host: str = "0.0.0.0",
                 port: int = 1988, host_cert: Optional[tuple[str, str]] = None):
        self._controller = controller
        self._app = Flask(__name__)

        self._host = host
        self._port = port
        self._host_cert = host_cert

        L.info("The listener is available on {}:{}", host, port)

        self._update_lock = threading.Lock()
        self._update_thread: Optional[threading.Thread] = None
        self._update_pending = False

        L.info("Running controller update on startup")
        self._request_update()

        @self._app.errorhandler(Exception)
        def on_error(exception):
            L.error("Unhandled exception occured: {}", exception)
            L.trace(traceback.format_exc())
            return "", 400

        @self._app.post("/")
        def on_event():
            self._request_update()
            return "", 200

    def _request_update(self):
        with self._update_lock:
            self._update_pending = True
            if self._update_thread is None or not self._update_thread.is_alive():
                self._update_thread = threading.Thread(
                    target=self._update_worker, daemon=True
                )
                self._update_thread.start()

    def _update_worker(self):
        while True:
            with self._update_lock:
                if not self._update_pending:
                    self._update_thread = None
                    return
                self._update_pending = False

            try:
                L.info("Starting controller update")
                self._controller.update()
                L.info("Controller update finished")
            except Exception as exc:
                L.error("Error during controller update: {}", exc)
                L.trace(traceback.format_exc())

    def run(self):
        extra_kwargs = {}

        if self._host_cert is None:
            L.warning("No TLS certificate specified, running in HTTP mode")
        else:
            certfile = self._host_cert[0]
            keyfile = self._host_cert[1]

            L.debug("Using {} as the certificate file", certfile)
            L.debug("Using {} as the key file", keyfile)

            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_context.load_cert_chain(certfile=certfile, keyfile=keyfile)

            extra_kwargs["ssl_context"] = ssl_context

        server = WSGIServer(
            (self._host, self._port),  # type: ignore
            self._app,
            do_handshake_on_connect=False,
            **extra_kwargs,
        )

        server.serve_forever()
